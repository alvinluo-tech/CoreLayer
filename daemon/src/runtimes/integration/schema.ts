/**
 * Channel Runtime — Database Schema
 *
 * Tables for channel accounts, conversations, and message logging.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ---- Channel Accounts ----

export const channelAccounts = sqliteTable("channel_accounts", {
  id: text("id").primaryKey(),
  channelType: text("channel_type").notNull(), // "wechat", "telegram", etc.
  displayName: text("display_name").notNull(),
  /** Platform-specific credentials/config (encrypted JSON) */
  config: text("config").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Channel Conversations ----

export const channelConversations = sqliteTable(
  "channel_conversations",
  {
    id: text("id").primaryKey(),
    channelAccountId: text("channel_account_id")
      .notNull()
      .references(() => channelAccounts.id, { onDelete: "cascade" }),
    /** Platform-specific chat/group/user identifier */
    platformConversationId: text("platform_conversation_id").notNull(),
    /** Mapped Jarvis conversation ID */
    jarvisConversationId: text("jarvis_conversation_id").notNull(),
    /** Optional workspace association */
    workspaceId: text("workspace_id"),
    /** Platform user metadata (JSON) */
    platformUserMetadata: text("platform_user_metadata").notNull().default("{}"),
    createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
    updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
  },
  (t) => [
    index("idx_channel_conv_account").on(t.channelAccountId),
    index("idx_channel_conv_platform").on(
      t.channelAccountId,
      t.platformConversationId,
    ),
    index("idx_channel_conv_jarvis").on(t.jarvisConversationId),
  ],
);

// ---- Channel Messages ----

export const channelMessages = sqliteTable(
  "channel_messages",
  {
    id: text("id").primaryKey(),
    channelConversationId: text("channel_conversation_id")
      .notNull()
      .references(() => channelConversations.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    content: text("content").notNull(),
    /** Platform-specific message ID for reply threading */
    platformMessageId: text("platform_message_id"),
    /** Additional metadata (JSON) */
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  },
  (t) => [
    index("idx_channel_msg_conv").on(t.channelConversationId),
    index("idx_channel_msg_created").on(t.createdAt),
  ],
);
