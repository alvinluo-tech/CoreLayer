export interface ConversationRow {
  id: string;
  userId: string;
  workspaceId: string | null;
  projectId: string | null;
  title: string;
  modelUsed: string;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls: string | null;
  toolCallId: string | null;
  parentMessageId: string | null;
  tokenCount: number | null;
  compressed: boolean;
  modelUsed?: string | null;
  createdAt: string;
}

export interface MessageInput {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: string;
  toolCallId?: string;
  parentMessageId?: string;
  tokenCount?: number;
  modelUsed?: string | null;
}

export interface MessageTreeNode {
  message: MessageRow;
  children: MessageTreeNode[];
}

export interface SearchResult {
  message: MessageRow;
  conversationTitle: string;
  snippet: string;
}

export interface ConversationRepository {
  create(title?: string, options?: { workspaceId?: string; projectId?: string }): Promise<ConversationRow>;
  list(): Promise<ConversationRow[]>;
  getById(id: string): Promise<ConversationRow | null>;
  update(id: string, data: { title?: string; modelUsed?: string }): Promise<ConversationRow>;
  delete(id: string): Promise<boolean>;
  deleteMany(ids: string[]): Promise<number>;
  addMessage(conversationId: string, data: MessageInput): Promise<MessageRow>;
  getMessages(conversationId: string): Promise<MessageRow[]>;
  clear(): Promise<number>;
  updateTokenUsage(id: string, promptTokens: number, completionTokens: number): Promise<ConversationRow>;
  editMessage(conversationId: string, messageId: string, newContent: string): Promise<MessageRow>;
  getMessageBranches(messageId: string): Promise<MessageRow[]>;
  getConversationTree(conversationId: string): Promise<MessageTreeNode[]>;
  deleteMessage(messageId: string): Promise<boolean>;
  markMessagesCompressed(messageIds: string[]): Promise<number>;
  searchMessages(query: string, limit?: number): Promise<SearchResult[]>;
  getMessagesByConversationIds(conversationIds: string[]): Promise<MessageRow[]>;
}
