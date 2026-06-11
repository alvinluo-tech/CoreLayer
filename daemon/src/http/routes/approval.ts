import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { toolRuntime } from "../../runtimes/tool/public-api.js";
import { executeApprovedTool } from "../../approvals/resume-service.js";
import { handleMessageInConversation } from "../../runtimes/agent/public-api.js";
import { executeOperation } from "../../operations/executors/operation-executor.js";
import { formatReceiptMessage } from "../../operations/receipts/operation-receipt.js";
import type { AuditLogRepository, ApprovalRequestRepository, ToolCallLogRepository } from "../../persistence/repository.js";

const approvalRoutes = new Hono();

// ---- Shared helpers ----

async function logApprovalDecision(
  auditLog: AuditLogRepository,
  existing: { toolName: string; risk: string; toolId: string },
  decision: "approve" | "deny",
  id: string,
): Promise<void> {
  await auditLog.create({
    actor: "user",
    action: "approval.decision",
    resource: `tool:${existing.toolName}`,
    riskLevel: existing.risk,
    permissionDecision: decision,
    confirmedByUser: decision === "approve",
    result: decision === "approve" ? "approved" : "denied",
    metadata: { toolId: existing.toolId, toolName: existing.toolName, approvalId: id },
  });
}

async function findPendingApproval(
  approvalRequests: ApprovalRequestRepository,
  id: string,
): Promise<{ data: import("../../persistence/repository.js").ApprovalRequestRow } | { notFound: true } | { notPending: string }> {
  const existing = await approvalRequests.getById(id);
  if (!existing) return { notFound: true };
  if (existing.status !== "pending") return { notPending: `Approval request is already ${existing.status}` };
  return { data: existing };
}

async function logDeniedToolCall(
  toolCallLogs: ToolCallLogRepository,
  existing: { toolId: string; toolName: string; source: string | null; args: unknown; risk: string },
): Promise<void> {
  await toolCallLogs.create({
    toolId: existing.toolId,
    toolName: existing.toolName,
    source: (existing.source as "mcp" | "native" | "skill" | "rest") ?? "rest",
    args: existing.args,
    resultSuccess: false,
    resultError: "User denied approval",
    risk: existing.risk,
    confirmedByUser: false,
  });
}

/**
 * Reusable helper to execute an approved tool, save the result to database messages,
 * log the audit entry, and optionally re-trigger the LLM to resume conversation.
 *
 * Status transitions: approved -> executing -> (succeeded on success | failed on error)
 */
async function resumeAndSaveToolResult(id: string, triggerLLM: boolean): Promise<void> {
  const { approvalRequests, toolCallLogs, conversations } = getRepositories();
  const existing = await approvalRequests.getById(id);
  if (!existing) return;

  // Mark as executing before running the tool
  await approvalRequests.markExecuting(id);

  let resumeResult;
  try {
    // Use operation-based execution if operationKind is set (new path)
    // Otherwise fall back to legacy tool execution
    if (existing.operationKind) {
      const receipt = await executeOperation(
        existing.operationKind,
        existing.operationPayload ? JSON.parse(existing.operationPayload as string) : {},
        { runId: existing.runId, conversationId: undefined },
      );
      resumeResult = {
        approvalRequestId: id,
        toolResult: { success: receipt.success, data: receipt, error: receipt.error },
        toolId: existing.toolId,
        toolName: existing.toolName,
        runId: existing.runId,
      };
    } else {
      resumeResult = await executeApprovedTool(id);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await approvalRequests.markFailed(id, errorMsg);
    logError("approvals/resume/execute-failed", err);
    return;
  }

  // Tool execution succeeded — mark as succeeded (not just "approved")
  if (resumeResult.toolResult.success) {
    await approvalRequests.markSucceeded(id);
  } else {
    await approvalRequests.markFailed(id, String(resumeResult.toolResult.error ?? "Tool execution failed"));
  }

  if (existing.runId) {
    const { agentRuns } = getRepositories();
    const run = await agentRuns.getById(existing.runId);
    if (run?.conversationId) {
      // For operation-based execution, append a receipt message
      if (existing.operationKind && resumeResult.toolResult.data) {
        const receipt = resumeResult.toolResult.data as import("../../operations/domain/operation.js").OperationReceipt;
        await conversations.addMessage(run.conversationId, {
          role: "system",
          content: formatReceiptMessage(receipt),
        });
      } else {
        await conversations.addMessage(run.conversationId, {
          role: "tool",
          content: JSON.stringify(resumeResult.toolResult),
          toolCallId: existing.toolCallId ?? undefined,
        });
      }

      if (triggerLLM) {
        const allApprovals = await approvalRequests.getByRunId(existing.runId);
        const pendingApprovals = allApprovals.filter(
          (app) => app.status === "pending" && app.id !== id
        );

        if (pendingApprovals.length === 0) {
          // Resume the run from waiting_for_approval back to running
          const { agentRuns } = getRepositories();
          await agentRuns.updateStatus(existing.runId, "running");

          await handleMessageInConversation(
            run.conversationId,
            "[System: Tool execution completed. Continue with the conversation.]",
            {
              runtimeContext: {
                runId: existing.runId,
                projectId: run.projectId ?? undefined,
                mode: run.mode,
              },
            },
          );
        } else {
          console.info(`[Approvals] Skipping LLM re-trigger: ${pendingApprovals.length} pending approvals remaining for run ${existing.runId}`);
        }
      }
    }
  }

  await toolCallLogs.create({
    toolId: existing.toolId,
    toolName: existing.toolName,
    source: (existing.source as "mcp" | "native" | "skill" | "rest") ?? "rest",
    args: existing.args,
    resultSuccess: resumeResult.toolResult.success,
    resultData: resumeResult.toolResult.data,
    resultError: resumeResult.toolResult.success ? undefined : String(resumeResult.toolResult.error),
    risk: existing.risk,
    confirmedByUser: true,
  });
}

// ---- Static routes MUST be registered before parameterized /:id/* routes ----

approvalRoutes.get("/", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const pending = await approvalRequests.getPending();
    return c.json({ data: pending });
  } catch (err) {
    logError("approvals/list", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/batch/approve - Approve multiple requests at once
 *
 * Executes all specified tools concurrently and re-triggers the LLM
 * only once per run after all executions complete, preventing duplicate replies.
 */
approvalRoutes.post("/batch/approve", async (c) => {
  try {
    const { approvalRequests, agentRuns, auditLog } = getRepositories();
    const body = await c.req.json<{ ids: string[] }>();
    const ids = body.ids ?? [];

    if (ids.length === 0) {
      return c.json({ data: [] });
    }

    const approvedIds: string[] = [];
    const runIds = new Set<string>();
    const updatedList: Awaited<ReturnType<typeof approvalRequests.approve>>[] = [];

    const lookups = await Promise.all(ids.map((id) => approvalRequests.getById(id)));
    const pendingItems = ids
      .map((id, i) => ({ id, existing: lookups[i] }))
      .filter((x) => x.existing && x.existing.status === "pending");

    await Promise.all(
      pendingItems.map(async ({ id, existing }) => {
        if (!existing) return;
        toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, true);
        const updated = await approvalRequests.approve(id);
        updatedList.push(updated);
        approvedIds.push(id);
        if (existing.runId) runIds.add(existing.runId);

        await logApprovalDecision(auditLog, existing, "approve", id);
      }),
    );

    // Execute only approved tools in parallel, then re-trigger LLM once per run
    const batchResumePromise = (async () => {
      await Promise.all(approvedIds.map((id) => resumeAndSaveToolResult(id, false)));

      for (const runId of runIds) {
        const run = await agentRuns.getById(runId);
        if (run?.conversationId) {
          // Resume the run from waiting_for_approval back to running
          await agentRuns.updateStatus(runId, "running");

          await handleMessageInConversation(
            run.conversationId,
            "[System: Batch tool execution completed. Continue with the conversation.]",
            {
              runtimeContext: {
                runId: run.id,
                projectId: run.projectId ?? undefined,
                mode: run.mode,
              },
            },
          );
        }
      }
    })();

    batchResumePromise.catch((err) => logError("approvals/batch/approve/resume-fatal", err));

    return c.json({ data: updatedList }, 202);
  } catch (err) {
    logError("approvals/batch/approve", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/batch/deny - Deny multiple requests at once
 */
approvalRoutes.post("/batch/deny", async (c) => {
  try {
    const { approvalRequests, toolCallLogs, agentRuns, auditLog } = getRepositories();
    const body = await c.req.json<{ ids: string[] }>();
    const ids = body.ids ?? [];
    const updatedList: Awaited<ReturnType<typeof approvalRequests.deny>>[] = [];
    const runIdsToFail = new Set<string>();

    const lookups = await Promise.all(ids.map((id) => approvalRequests.getById(id)));
    const pendingItems = ids
      .map((id, i) => ({ id, existing: lookups[i] }))
      .filter((x) => x.existing && x.existing.status === "pending");

    await Promise.all(
      pendingItems.map(async ({ id, existing }) => {
        if (!existing) return;
        toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, false);
        const updated = await approvalRequests.deny(id);
        updatedList.push(updated);

        if (existing.runId) {
          runIdsToFail.add(existing.runId);
        }

        await logApprovalDecision(auditLog, existing, "deny", id);
        await logDeniedToolCall(toolCallLogs, existing);
      }),
    );

    for (const runId of runIdsToFail) {
      await agentRuns.updateStatus(runId, "failed", "User denied tool approval");
    }

    return c.json({ data: updatedList });
  } catch (err) {
    logError("approvals/batch/deny", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

approvalRoutes.post("/expire-stale", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const body = (await c.req.json<{ maxAgeMs?: number }>().catch(() => ({}))) as { maxAgeMs?: number };
    const maxAgeMs = body.maxAgeMs ?? 300_000;
    const { count, ids } = await approvalRequests.expireStale(maxAgeMs);
    const guard = toolRuntime.getPermissionGuard();
    for (const id of ids) {
      guard.resolvePendingConfirmation(id, false);
    }
    return c.json({ expired: count });
  } catch (err) {
    logError("approvals/expire-stale", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

// ---- Parameterized routes (MUST come after static /batch/* routes) ----

approvalRoutes.get("/:id", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const id = c.req.param("id");
    const request = await approvalRequests.getById(id);
    if (!request) {
      return apiError(c, "Approval request not found", 404);
    }
    return c.json({ data: request });
  } catch (err) {
    logError("approvals/get", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/:id/approve - Approve a pending request
 *
 * Returns 202 Accepted. The tool is executed asynchronously and the
 * result is appended to the conversation, then the LLM is re-triggered.
 */
approvalRoutes.post("/:id/approve", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const id = c.req.param("id");
    const lookup = await findPendingApproval(approvalRequests, id);
    if ("notFound" in lookup) return apiError(c, "Approval request not found", 404);
    if ("notPending" in lookup) return apiError(c, lookup.notPending, 400);
    const existing = lookup.data;

    toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, true);
    const updated = await approvalRequests.approve(id);

    const { auditLog } = getRepositories();
    await logApprovalDecision(auditLog, existing, "approve", id);

    const resumePromise = resumeAndSaveToolResult(id, true);
    resumePromise.catch((err) => logError("approvals/approve/resume-fatal", err));

    return c.json({ data: updated }, 202);
  } catch (err) {
    logError("approvals/approve", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/:id/deny - Deny a pending request
 */
approvalRoutes.post("/:id/deny", async (c) => {
  try {
    const { approvalRequests, toolCallLogs, agentRuns } = getRepositories();
    const id = c.req.param("id");
    const lookup = await findPendingApproval(approvalRequests, id);
    if ("notFound" in lookup) return apiError(c, "Approval request not found", 404);
    if ("notPending" in lookup) return apiError(c, lookup.notPending, 400);
    const existing = lookup.data;

    toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, false);
    const updated = await approvalRequests.deny(id);

    if (existing.runId) {
      await agentRuns.updateStatus(existing.runId, "failed", "User denied tool approval");
    }

    const { auditLog } = getRepositories();
    await logApprovalDecision(auditLog, existing, "deny", id);
    await logDeniedToolCall(toolCallLogs, existing);

    return c.json({ data: updated });
  } catch (err) {
    logError("approvals/deny", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/:id/remember - Remember the user's decision for this tool
 */
approvalRoutes.post("/:id/remember", async (c) => {
  try {
    const { approvalRequests, permissionMemories, agentRuns, toolCallLogs } = getRepositories();
    const id = c.req.param("id");
    const body = await c.req.json<{
      decision: "auto" | "confirm" | "deny";
      scope?: "global" | "project";
      projectId?: string;
    }>();

    if (!body.decision || !["auto", "confirm", "deny"].includes(body.decision)) {
      return apiError(c, "Invalid decision value", 400);
    }

    const existing = await approvalRequests.getById(id);
    if (!existing) {
      return apiError(c, "Approval request not found", 404);
    }

    await permissionMemories.create({
      toolId: existing.toolId,
      risk: existing.risk,
      decision: body.decision,
      scope: body.scope ?? "global",
      projectId: body.projectId ?? null,
    });

    if (existing.status === "pending") {
      const approved = body.decision !== "deny";
      toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, approved);

      const { auditLog } = getRepositories();
      if (approved) {
        await approvalRequests.approve(id);
        await logApprovalDecision(auditLog, existing, "approve", id);
        const resumePromise = resumeAndSaveToolResult(id, true);
        resumePromise.catch((err) => logError("approvals/remember/resume-fatal", err));
      } else {
        await approvalRequests.deny(id);
        await logApprovalDecision(auditLog, existing, "deny", id);
        await logDeniedToolCall(toolCallLogs, existing);
        if (existing.runId) {
          await agentRuns.updateStatus(existing.runId, "failed", "User denied tool approval");
        }
      }
    }

    return c.json({ success: true });
  } catch (err) {
    logError("approvals/remember", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default approvalRoutes;
