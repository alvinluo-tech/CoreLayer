import type { Repositories } from "../repository.js";
import { createSqliteTaskRepo } from "./task-repo.js";
import { createSqliteArticleRepo } from "./article-repo.js";
import { createSqliteReviewRepo } from "./review-repo.js";
import { createSqliteConversationRepo } from "./conversation-repo.js";
import { createSqliteToolCallLogRepo } from "./tool-call-log-repo.js";
import { createSqliteAppConnectionRepo } from "./app-connection-repo.js";
import { createSqliteModelProfileRepo } from "./model-profile-repo.js";
import { createSqliteMemoryRepo } from "./memory-repo.js";

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
  };
}
