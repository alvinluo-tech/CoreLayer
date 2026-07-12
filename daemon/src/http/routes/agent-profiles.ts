import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import type { CreateAgentProfileInput, UpdateAgentProfileData } from "../../persistence/repository.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { logAuditEntry } from "../../persistence/audit-log.js";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnProcess, isCommandAvailable } from "../../runtimes/coding/public-api.js";
import { z } from "zod";

const agentProfileRoutes = new Hono();

const executorTypeSchema = z.enum(["self", "codex", "claude-code", "opencode"]);

const agentModelPolicySchema = z.object({
  preferredModels: z.array(z.string()).optional(),
  fallbackModel: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  provider: z.string().optional(),
});

const agentExecutorPolicySchema = z.object({
  executor: executorTypeSchema,
  maxConcurrent: z.number().optional(),
  workDir: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
});

const createProfileSchema = z.object({
  name: z.string().min(1, "name is required and must be a string"),
  description: z.any().transform(val => typeof val === "string" ? val : undefined).optional(),
  modelPolicy: agentModelPolicySchema.optional(),
  executorPolicy: agentExecutorPolicySchema.optional(),
  skills: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  knowledgeScopes: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  memoryScopes: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  modelPolicy: agentModelPolicySchema.nullable().optional(),
  executorPolicy: agentExecutorPolicySchema.nullable().optional(),
  skills: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  knowledgeScopes: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  memoryScopes: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

function validateCreateInput(body: unknown): { ok: true; input: CreateAgentProfileInput } | { ok: false; error: string } {
  const result = createProfileSchema.safeParse(body);
  if (!result.success) {
    return { ok: false, error: result.error.errors[0]?.message || "Validation failed" };
  }
  return { ok: true, input: result.data };
}

function validateUpdateInput(body: unknown): { ok: true; data: UpdateAgentProfileData } | { ok: false; error: string } {
  const result = updateProfileSchema.safeParse(body);
  if (!result.success) {
    return { ok: false, error: result.error.errors[0]?.message || "Validation failed" };
  }
  
  const data: UpdateAgentProfileData = {
    name: result.data.name,
    description: result.data.description === null ? undefined : result.data.description,
    modelPolicy: result.data.modelPolicy === null ? undefined : result.data.modelPolicy,
    executorPolicy: result.data.executorPolicy === null ? undefined : result.data.executorPolicy,
    skills: result.data.skills,
    tools: result.data.tools,
    knowledgeScopes: result.data.knowledgeScopes,
    permissions: result.data.permissions,
    memoryScopes: result.data.memoryScopes,
    isDefault: result.data.isDefault,
  };
  return { ok: true, data };
}

agentProfileRoutes.get(
  "/",
  withErrorHandling("agent-profiles/list", async (c) => {
    const { agentProfiles } = getRepositories();
    const profiles = await agentProfiles.getAll();
    return c.json({ data: profiles });
  }),
);

agentProfileRoutes.get(
  "/default",
  withErrorHandling("agent-profiles/default", async (c) => {
    const { agentProfiles } = getRepositories();
    const profile = await agentProfiles.getDefault();
    if (!profile) {
      return apiError(c, "No default agent profile found", 404);
    }
    return c.json({ data: profile });
  }),
);

agentProfileRoutes.post(
  "/",
  withErrorHandling("agent-profiles/create", async (c) => {
    const body = await c.req.json();
    const validation = validateCreateInput(body);
    if (!validation.ok) {
      return apiError(c, validation.error, 400);
    }
    const { agentProfiles } = getRepositories();
    const profile = await agentProfiles.create(validation.input);
    await logAuditEntry({
      actor: "user",
      action: "agent-profile.create",
      resource: `agent-profile:${profile.id}`,
      decision: "approved",
      result: "created",
      metadata: { id: profile.id, name: profile.name },
    });
    return c.json({ data: profile }, 201);
  }),
);

agentProfileRoutes.get(
  "/:id",
  withErrorHandling("agent-profiles/get", async (c) => {
    const { agentProfiles } = getRepositories();
    const id = c.req.param("id")!;
    const profile = await agentProfiles.getById(id);
    if (!profile) {
      return apiError(c, "Agent profile not found", 404);
    }
    return c.json({ data: profile });
  }),
);

agentProfileRoutes.patch(
  "/:id",
  withErrorHandling("agent-profiles/update", async (c) => {
    const id = c.req.param("id")!;
    const body = await c.req.json();
    const validation = validateUpdateInput(body);
    if (!validation.ok) {
      return apiError(c, validation.error, 400);
    }
    const { agentProfiles } = getRepositories();
    const existing = await agentProfiles.getById(id);
    if (!existing) {
      return apiError(c, "Agent profile not found", 404);
    }
    const profile = await agentProfiles.update(id, validation.data);
    await logAuditEntry({
      actor: "user",
      action: "agent-profile.update",
      resource: `agent-profile:${id}`,
      decision: "approved",
      result: "updated",
      metadata: { id, changes: Object.keys(body) },
    });
    return c.json({ data: profile });
  }),
);

agentProfileRoutes.delete(
  "/:id",
  withErrorHandling("agent-profiles/delete", async (c) => {
    const id = c.req.param("id")!;
    const { agentProfiles } = getRepositories();
    const existing = await agentProfiles.getById(id);
    if (!existing) {
      return apiError(c, "Agent profile not found", 404);
    }
    if (existing.isDefault) {
      return apiError(c, "Cannot delete the default agent profile", 400);
    }
    await agentProfiles.delete(id);
    await logAuditEntry({
      actor: "user",
      action: "agent-profile.delete",
      resource: `agent-profile:${id}`,
      decision: "approved",
      result: "deleted",
      metadata: { id, name: existing.name },
    });
    return c.json({ data: { deleted: true } });
  }),
);

agentProfileRoutes.post(
  "/:id/set-default",
  withErrorHandling("agent-profiles/set-default", async (c) => {
    const id = c.req.param("id")!;
    const { agentProfiles } = getRepositories();
    const existing = await agentProfiles.getById(id);
    if (!existing) {
      return apiError(c, "Agent profile not found", 404);
    }
    const all = await agentProfiles.getAll();
    for (const p of all) {
      if (p.isDefault) {
        await agentProfiles.update(p.id, { isDefault: false });
      }
    }
    const profile = await agentProfiles.update(id, { isDefault: true });
    await logAuditEntry({
      actor: "user",
      action: "agent-profile.set-default",
      resource: `agent-profile:${id}`,
      decision: "approved",
      result: "updated",
      metadata: { id, name: existing.name },
    });
    return c.json({ data: profile });
  }),
);

agentProfileRoutes.post(
  "/:id/test",
  withErrorHandling("agent-profiles/test", async (c) => {
    const id = c.req.param("id")!;
    const { agentProfiles } = getRepositories();
    const profile = await agentProfiles.getById(id);
    if (!profile) {
      return apiError(c, "Agent profile not found", 404);
    }

    const executorPolicy = profile.executorPolicy as Record<string, unknown> | null;
    const executor = executorPolicy?.executor || "self";

    const startTime = Date.now();

    // Case 1: CLI coding executors
    if (executor === "claude-code" || executor === "codex" || executor === "opencode") {
      const cliCommand = executor === "claude-code" ? "claude" : executor === "codex" ? "codex" : "opencode";
      const installHint =
        executor === "claude-code"
          ? "npm install -g @anthropic-ai/claude-code"
          : executor === "codex"
          ? "npm install -g @openai/codex"
          : "https://github.com/opencode-ai/opencode";

      if (!isCommandAvailable(cliCommand)) {
        return c.json({
          data: {
            success: false,
            durationMs: Date.now() - startTime,
            error: `Command '${cliCommand}' not found on PATH.`,
            suggestion: `Run '${installHint}' to install ${cliCommand} globally.`,
            logs: `[error] '${cliCommand}' is not recognized as an internal or external command.`,
          },
        });
      }

      // Setup temporary directory
      const tempBase = path.join(os.homedir(), ".jarvis", "test-runs");
      const tempDir = path.join(tempBase, `test-${id}`);
      try {
        fs.mkdirSync(tempDir, { recursive: true });
      } catch (err) {
        return c.json({
          data: {
            success: false,
            durationMs: Date.now() - startTime,
            error: "Failed to create temporary workspace directory",
            suggestion: "Ensure Jarvis has write permissions to home directory folder ~/.jarvis",
            logs: `[error] ${err instanceof Error ? err.message : String(err)}`,
          },
        });
      }

      try {
        // 1. Initialize git repository in tempDir
        const gitInit = await spawnProcess({
          command: "git",
          args: ["init"],
          cwd: tempDir,
          timeoutMs: 5000,
        });
        if (gitInit.exitCode !== 0) {
          throw new Error(`Git initialization failed: ${gitInit.stderr}`);
        }

        // 2. Prepare diagnostic command args - we use a print check to avoid triggering interactive write approval warnings
        const args =
          executor === "claude-code"
            ? ["--print", "--output-format", "text", "--no-session-persistence", "Reply with exactly: AGENT_DIAGNOSTICS_OK"]
            : executor === "codex"
            ? ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "Reply with exactly: AGENT_DIAGNOSTICS_OK"]
            : ["--prompt", "Reply with exactly: AGENT_DIAGNOSTICS_OK"];

        // 3. Execute coding adapter dry-run task
        const runResult = await spawnProcess({
          command: cliCommand,
          args,
          cwd: tempDir,
          timeoutMs: 30000,
        });

        const durationMs = Date.now() - startTime;
        const stdoutUpper = runResult.stdout.toUpperCase();
        const passed = runResult.exitCode === 0 && stdoutUpper.includes("AGENT_DIAGNOSTICS_OK");

        // Cleanup temp folder
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors to prevent failing the route
        }

        await logAuditEntry({
          actor: "user",
          action: "agent-profile.test",
          resource: `agent-profile:${id}`,
          decision: "approved",
          result: passed ? "passed" : "failed",
          metadata: { id, executor, durationMs, exitCode: runResult.exitCode },
        });

        if (passed) {
          return c.json({
            data: {
              success: true,
              durationMs,
              logs: `[stdout] ${runResult.stdout}\n[verification] CLI verification token match successful.`,
              stdout: runResult.stdout,
              stderr: runResult.stderr,
              exitCode: runResult.exitCode,
            },
          });
        } else {
          return c.json({
            data: {
              success: false,
              durationMs,
              error: `Dry-run execution failed with exit code ${runResult.exitCode} or token mismatch.`,
              suggestion: `Verify that ${cliCommand} is properly configured, authenticated, and can communicate with the model.`,
              logs: `[stdout] ${runResult.stdout}\n[stderr] ${runResult.stderr}`,
              stdout: runResult.stdout,
              stderr: runResult.stderr,
              exitCode: runResult.exitCode,
            },
          });
        }
      } catch (err) {
        // Cleanup temp folder in case of errors
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore
        }

        const durationMs = Date.now() - startTime;
        return c.json({
          data: {
            success: false,
            durationMs,
            error: err instanceof Error ? err.message : "Diagnostics execution error",
            suggestion: "Check your path environment variables and CLI execution permissions.",
            logs: `[exception] ${err instanceof Error ? err.stack : String(err)}`,
          },
        });
      }
    }

    // Case 2: LLM API based executor (self)
    const hasApiKey =
      process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;

    const durationMs = Date.now() - startTime;

    await logAuditEntry({
      actor: "user",
      action: "agent-profile.test",
      resource: `agent-profile:${id}`,
      decision: "approved",
      result: hasApiKey ? "passed" : "failed",
      metadata: { id, executor, durationMs },
    });

    if (hasApiKey) {
      const activeKeys = [
        process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" : "",
        process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "",
        process.env.OPENAI_API_KEY ? "OPENAI_API_KEY" : "",
      ].filter(Boolean);

      return c.json({
        data: {
          success: true,
          durationMs,
          logs: `[api-check] Verified API key environment variables. Active: ${activeKeys.join(", ")}`,
        },
      });
    } else {
      return c.json({
        data: {
          success: false,
          durationMs,
          error: "No active API key credentials found in system environment.",
          suggestion: "Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in your system environment variables.",
          logs: "[api-check] GEMINI_API_KEY, ANTHROPIC_API_KEY, and OPENAI_API_KEY are all undefined.",
        },
      });
    }
  })
);

export default agentProfileRoutes;
