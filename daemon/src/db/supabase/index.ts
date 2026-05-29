import type { Repositories } from "../repository.js";
import { createSupabaseTaskRepo } from "./task-repo.js";
import { createSupabaseArticleRepo } from "./article-repo.js";
import { createSupabaseReviewRepo } from "./review-repo.js";
import { createSupabaseConversationRepo } from "./conversation-repo.js";
import { createSupabaseToolCallLogRepo } from "./tool-call-log-repo.js";
import { createSupabaseAppConnectionRepo } from "./app-connection-repo.js";
import { createSupabaseModelProfileRepo } from "./model-profile-repo.js";
import { createSupabaseMemoryRepo } from "./memory-repo.js";

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
  };
}
