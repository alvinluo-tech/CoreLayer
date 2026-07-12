import type { Repositories } from "../repository.js";
import { createSupabaseTaskRepo } from "./task-repo.js";
import { createSupabaseArticleRepo } from "./article-repo.js";
import { createSupabaseReviewRepo } from "./review-repo.js";
import { createSupabaseConversationRepo } from "./conversation-repo.js";
import { createSupabaseToolCallLogRepo } from "./tool-call-log-repo.js";
import { createSupabaseAppConnectionRepo } from "./app-connection-repo.js";
import { createSupabaseModelProfileRepo } from "./model-profile-repo.js";
import { createSupabaseMemoryRepo } from "./memory-repo.js";
import { createSupabaseAgentRunRepo } from "./agent-run-repo.js";
import { createSqliteScheduledTaskRepo } from "../sqlite/scheduled-task-repo.js";
import { createSqliteGoalRepo } from "../sqlite/goal-repo.js";
import { createSqliteWorkspaceRepo } from "../sqlite/workspace-repo.js";
import { createSqliteProjectRepo } from "../sqlite/project-repo.js";
import { createSqliteAgentProfileRepo } from "../sqlite/agent-profile-repo.js";
import { createSqliteApprovalRepo } from "../sqlite/approval-repo.js";
import { createSqlitePermissionMemoryRepo } from "../sqlite/permission-memory-repo.js";
import { createSqliteAgentRunEventRepo } from "../sqlite/agent-run-event-repo.js";
import { createSqliteEventLogRepo } from "../sqlite/event-log-repo.js";
import { createSqliteAuditLogRepo } from "../sqlite/audit-log-repo.js";
import { createSqliteExecutorRunRepo } from "../sqlite/executor-run-repo.js";
import { createSqliteEnvironmentSessionRepo, createSqliteEnvironmentEventRepo } from "../sqlite/environment-repo.js";
import { createSqliteExecutionLogRepo } from "../sqlite/execution-log-repo.js";
import { createSqlitePendingActionRepo } from "../sqlite/pending-action-repo.js";

export function createSupabaseRepositories(): Repositories {
  return {
    tasks: createSupabaseTaskRepo(),
    articles: createSupabaseArticleRepo(),
    reviews: createSupabaseReviewRepo(),
    conversations: createSupabaseConversationRepo(),
    toolCallLogs: createSupabaseToolCallLogRepo(),
    appConnections: createSupabaseAppConnectionRepo(),
    modelProfiles: createSupabaseModelProfileRepo(),
    memories: createSupabaseMemoryRepo(),
    agentRuns: createSupabaseAgentRunRepo(),
    scheduledTasks: createSqliteScheduledTaskRepo(),
    goals: createSqliteGoalRepo(),
    workspaces: createSqliteWorkspaceRepo(),
    projects: createSqliteProjectRepo(),
    agentProfiles: createSqliteAgentProfileRepo(),
    approvalRequests: createSqliteApprovalRepo(),
    permissionMemories: createSqlitePermissionMemoryRepo(),
    agentRunEvents: createSqliteAgentRunEventRepo(),
    eventLog: createSqliteEventLogRepo(),
    auditLog: createSqliteAuditLogRepo(),
    executorRuns: createSqliteExecutorRunRepo(),
    environmentSessions: createSqliteEnvironmentSessionRepo(),
    environmentEvents: createSqliteEnvironmentEventRepo(),
    executionLogs: createSqliteExecutionLogRepo(),
    pendingActions: createSqlitePendingActionRepo(),
  };
}
