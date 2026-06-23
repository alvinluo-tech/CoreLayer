import type { Repositories } from "../repository.js";
import { createSqliteTaskRepo } from "./task-repo.js";
import { createSqliteArticleRepo } from "./article-repo.js";
import { createSqliteReviewRepo } from "./review-repo.js";
import { createSqliteConversationRepo } from "./conversation-repo.js";
import { createSqliteToolCallLogRepo } from "./tool-call-log-repo.js";
import { createSqliteAppConnectionRepo } from "./app-connection-repo.js";
import { createSqliteModelProfileRepo } from "./model-profile-repo.js";
import { createSqliteMemoryRepo } from "./memory-repo.js";
import { createSqliteAgentRunRepo } from "./agent-run-repo.js";
import { createSqliteScheduledTaskRepo } from "./scheduled-task-repo.js";
import { createSqliteGoalRepo } from "./goal-repo.js";
import { createSqliteWorkspaceRepo } from "./workspace-repo.js";
import { createSqliteProjectRepo } from "./project-repo.js";
import { createSqliteAgentProfileRepo } from "./agent-profile-repo.js";
import { createSqliteApprovalRepo } from "./approval-repo.js";
import { createSqlitePermissionMemoryRepo } from "./permission-memory-repo.js";
import { createSqliteAgentRunEventRepo } from "./agent-run-event-repo.js";
import { createSqliteEventLogRepo } from "./event-log-repo.js";
import { createSqliteAuditLogRepo } from "./audit-log-repo.js";
import { createSqliteExecutorRunRepo } from "./executor-run-repo.js";
import { createSqliteEnvironmentSessionRepo, createSqliteEnvironmentEventRepo } from "./environment-repo.js";

export function createSqliteRepositories(): Repositories {
  return {
    tasks: createSqliteTaskRepo(),
    articles: createSqliteArticleRepo(),
    reviews: createSqliteReviewRepo(),
    conversations: createSqliteConversationRepo(),
    toolCallLogs: createSqliteToolCallLogRepo(),
    appConnections: createSqliteAppConnectionRepo(),
    modelProfiles: createSqliteModelProfileRepo(),
    memories: createSqliteMemoryRepo(),
    agentRuns: createSqliteAgentRunRepo(),
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
  };
}
