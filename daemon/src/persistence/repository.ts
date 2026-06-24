// Barrel re-export — backward-compatible entry point
// Domain-specific types live in ./repository/*.ts

export type {
  TaskRow,
  CreateTaskInput,
  TaskFilters,
  UpdateTaskData,
  TaskRepository,
} from "./repository/task.js";

export type {
  ArticleRow,
  CreateArticleInput,
  ArticleFilters,
  UpdateArticleData,
  ArticleRepository,
} from "./repository/article.js";

export type {
  ReviewRow,
  SaveReviewInput,
  DailySummaryResult,
  WeeklyStatsResult,
  ReviewRepository,
} from "./repository/review.js";

export type {
  ConversationRow,
  MessageRow,
  MessageInput,
  MessageTreeNode,
  SearchResult,
  ConversationRepository,
} from "./repository/conversation.js";

export type {
  ToolCallLogRow,
  CreateToolCallLogInput,
  AppConnectionRow,
  UpsertAppConnectionInput,
  ModelProfileRow,
  UpsertModelProfileInput,
  ToolCallLogRepository,
  AppConnectionRepository,
  ModelProfileRepository,
} from "./repository/integrations.js";

export type {
  MemoryRow,
  ScoredMemoryRow,
  UpsertMemoryInput,
  MemoryRepository,
} from "./repository/memory.js";

export type {
  AgentRunRow,
  CreateAgentRunInput,
  AgentRunRepository,
  AgentRunEventRow,
  CreateAgentRunEventInput,
  AgentRunEventRepository,
  AgentProfileRow,
  CreateAgentProfileInput,
  UpdateAgentProfileData,
  AgentProfileRepository,
} from "./repository/agent.js";

export type {
  ScheduledTaskRow,
  CreateScheduledTaskInput,
  UpdateScheduledTaskData,
  ScheduledTaskRepository,
} from "./repository/scheduled-task.js";

export type {
  GoalRow,
  CreateGoalInput,
  UpdateGoalData,
  GoalRepository,
} from "./repository/goal.js";

export type {
  WorkspaceRow,
  CreateWorkspaceInput,
  UpdateWorkspaceData,
  WorkspaceRepository,
} from "./repository/workspace.js";

export type {
  ProjectRow,
  CreateProjectInput,
  UpdateProjectData,
  ProjectRepository,
} from "./repository/project.js";

export type {
  ApprovalRequestRow,
  CreateApprovalRequestInput,
  ApprovalRequestRepository,
  PermissionMemoryRow,
  CreatePermissionMemoryInput,
  PermissionMemoryRepository,
} from "./repository/authorization.js";

export type {
  EventLogRow,
  CreateEventLogInput,
  EventLogFilters,
  EventLogRepository,
  AuditLogRow,
  CreateAuditLogInput,
  AuditLogFilters,
  AuditLogRepository,
} from "./repository/observability.js";

export type {
  ExecutorRunRow,
  CreateExecutorRunInput,
  UpdateExecutorRunInput,
  ExecutorRunStatus,
  ExecutorRunRepository,
} from "./repository/executor-run.js";

export type {
  EnvironmentSessionRow,
  CreateEnvironmentSessionInput,
  UpdateEnvironmentSessionInput,
  EnvironmentState,
  EnvironmentSessionRepository,
  EnvironmentEventRow,
  CreateEnvironmentEventInput,
  EnvironmentEventRepository,
} from "./repository/environment.js";

export type {
  ExecutionLogRow,
  CreateExecutionLogInput,
  ExecutionLogRepository,
} from "./repository/execution-log.js";

// ---- Aggregate ----

import type { TaskRepository } from "./repository/task.js";
import type { ArticleRepository } from "./repository/article.js";
import type { ReviewRepository } from "./repository/review.js";
import type { ConversationRepository } from "./repository/conversation.js";
import type { ToolCallLogRepository, AppConnectionRepository, ModelProfileRepository } from "./repository/integrations.js";
import type { MemoryRepository } from "./repository/memory.js";
import type { AgentRunRepository, AgentRunEventRepository, AgentProfileRepository } from "./repository/agent.js";
import type { ScheduledTaskRepository } from "./repository/scheduled-task.js";
import type { GoalRepository } from "./repository/goal.js";
import type { WorkspaceRepository } from "./repository/workspace.js";
import type { ProjectRepository } from "./repository/project.js";
import type { ApprovalRequestRepository, PermissionMemoryRepository } from "./repository/authorization.js";
import type { EventLogRepository, AuditLogRepository } from "./repository/observability.js";
import type { ExecutorRunRepository } from "./repository/executor-run.js";
import type { EnvironmentSessionRepository, EnvironmentEventRepository } from "./repository/environment.js";
import type { ExecutionLogRepository } from "./repository/execution-log.js";

export interface Repositories {
  tasks: TaskRepository;
  articles: ArticleRepository;
  reviews: ReviewRepository;
  conversations: ConversationRepository;
  toolCallLogs: ToolCallLogRepository;
  appConnections: AppConnectionRepository;
  modelProfiles: ModelProfileRepository;
  memories: MemoryRepository;
  agentRuns: AgentRunRepository;
  scheduledTasks: ScheduledTaskRepository;
  goals: GoalRepository;
  workspaces: WorkspaceRepository;
  projects: ProjectRepository;
  agentProfiles: AgentProfileRepository;
  approvalRequests: ApprovalRequestRepository;
  permissionMemories: PermissionMemoryRepository;
  agentRunEvents: AgentRunEventRepository;
  eventLog: EventLogRepository;
  auditLog: AuditLogRepository;
  executorRuns: ExecutorRunRepository;
  environmentSessions: EnvironmentSessionRepository;
  environmentEvents: EnvironmentEventRepository;
  executionLogs: ExecutionLogRepository;
}
