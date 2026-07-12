CREATE TABLE `agent_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`role` text DEFAULT 'general' NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`model_policy` text DEFAULT '{}' NOT NULL,
	`executor_policy` text,
	`skills` text DEFAULT '[]' NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`knowledge_scopes` text DEFAULT '[]' NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`memory_scopes` text DEFAULT '[]' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`workspace_id` text,
	`project_id` text,
	`task_id` text,
	`agent_id` text,
	`user_message_id` text,
	`assistant_message_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`mode` text DEFAULT 'chat' NOT NULL,
	`selected_model` text,
	`route_reason` text,
	`selected_tools` text DEFAULT '[]',
	`memory_reads` text DEFAULT '[]',
	`memory_writes` text DEFAULT '[]',
	`tool_calls` text DEFAULT '[]',
	`tool_call_count` integer DEFAULT 0,
	`artifacts` text DEFAULT '[]',
	`approvals` text DEFAULT '[]',
	`started_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`completed_at` text,
	`duration_ms` integer,
	`error` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agent_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `app_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`app_name` text NOT NULL,
	`source` text NOT NULL,
	`config` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`last_connected` text,
	`last_error` text,
	`tool_count` integer DEFAULT 0,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_connections_app_id_unique` ON `app_connections` (`app_id`);--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`args` text NOT NULL,
	`risk` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`project_scope` integer DEFAULT false NOT NULL,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`mode` text DEFAULT 'chat',
	`source` text,
	`preview` text,
	`tool_call_id` text,
	`expires_at` integer,
	`operation_kind` text,
	`operation_payload` text,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`url` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'unread' NOT NULL,
	`rating` integer,
	`notes` text,
	`category` text,
	`added_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`run_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`path` text,
	`content` text,
	`metadata` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`risk_level` text,
	`permission_decision` text,
	`confirmed_by_user` integer,
	`result` text,
	`metadata` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `capability_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`project_id` text,
	`task_id` text,
	`run_id` text,
	`agent_id` text,
	`executor_id` text,
	`profile` text NOT NULL,
	`actions` text DEFAULT '[]' NOT NULL,
	`resources` text DEFAULT '[]' NOT NULL,
	`constraints` text DEFAULT '{}',
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`expires_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE TABLE `channel_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_type` text NOT NULL,
	`display_name` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channel_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_account_id` text NOT NULL,
	`platform_conversation_id` text NOT NULL,
	`jarvis_conversation_id` text NOT NULL,
	`workspace_id` text,
	`platform_user_metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`channel_account_id`) REFERENCES `channel_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_channel_conv_account` ON `channel_conversations` (`channel_account_id`);--> statement-breakpoint
CREATE INDEX `idx_channel_conv_platform` ON `channel_conversations` (`channel_account_id`,`platform_conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_channel_conv_jarvis` ON `channel_conversations` (`jarvis_conversation_id`);--> statement-breakpoint
CREATE TABLE `channel_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_conversation_id` text NOT NULL,
	`direction` text NOT NULL,
	`content` text NOT NULL,
	`platform_message_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`channel_conversation_id`) REFERENCES `channel_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_channel_msg_conv` ON `channel_messages` (`channel_conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_channel_msg_created` ON `channel_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'default' NOT NULL,
	`workspace_id` text,
	`project_id` text,
	`title` text DEFAULT 'New Chat' NOT NULL,
	`model_used` text DEFAULT 'mimo-v2.5-pro' NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`prompt_tokens` integer DEFAULT 0,
	`completion_tokens` integer DEFAULT 0,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conversations_updated_at_idx` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `environment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `environment_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `environment_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`run_id` text,
	`agent_id` text,
	`environment_kind` text NOT NULL,
	`state` text DEFAULT 'created' NOT NULL,
	`working_directory` text,
	`access_policy` text DEFAULT '{}',
	`metadata` text DEFAULT '{}',
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agent_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `event_log` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`agent_run_id` text,
	`runtime_id` text,
	`payload` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`executor_run_id` text,
	`workspace_id` text,
	`project_id` text,
	`task_id` text,
	`stream` text NOT NULL,
	`sequence` integer NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `executor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text,
	`workspace_id` text,
	`project_id` text,
	`task_id` text,
	`agent_id` text,
	`adapter_id` text NOT NULL,
	`domain` text DEFAULT 'coding' NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`task_prompt` text NOT NULL,
	`environment_kind` text DEFAULT 'local' NOT NULL,
	`environment_config` text DEFAULT '{}',
	`working_directory` text,
	`pid` integer,
	`exit_code` integer,
	`error` text,
	`failure_category` text,
	`timeout_ms` integer,
	`artifacts` text DEFAULT '{}',
	`started_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`completed_at` text,
	`duration_ms` integer,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agent_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'default' NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`progress` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'default' NOT NULL,
	`scope_type` text DEFAULT 'user' NOT NULL,
	`scope_id` text,
	`type` text NOT NULL,
	`tier` text DEFAULT 'context' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`source` text,
	`confidence` real,
	`uses` integer DEFAULT 0 NOT NULL,
	`last_injected_at` text,
	`source_run_id` text,
	`source_message_id` text,
	`last_verified_at` text,
	`expires_at` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`tool_calls` text,
	`tool_call_id` text,
	`parent_message_id` text,
	`token_count` integer,
	`compressed` integer DEFAULT false NOT NULL,
	`model_used` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `model_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_name` text NOT NULL,
	`display_name` text,
	`capabilities` text,
	`limits` text,
	`cost` text,
	`is_default` integer DEFAULT false,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`approval_request_id` text NOT NULL,
	`run_id` text NOT NULL,
	`executor_run_id` text,
	`workspace_id` text,
	`project_id` text,
	`task_id` text,
	`action_fingerprint` text NOT NULL,
	`action_payload` text NOT NULL,
	`resume_payload` text NOT NULL,
	`status` text DEFAULT 'blocked' NOT NULL,
	`error` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `permission_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`run_id` text,
	`tool_id` text NOT NULL,
	`risk` text NOT NULL,
	`decision` text NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text,
	`workspace_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`strategy` text NOT NULL,
	`task_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`spec` text,
	`tech_stack` text,
	`root_path` text,
	`status` text DEFAULT 'active' NOT NULL,
	`settings` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`task_completion_rate` real,
	`articles_read` integer,
	`summary` text,
	`patterns` text,
	`suggestions` text,
	`raw_data` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cron_expr` text NOT NULL,
	`prompt` text,
	`skill_name` text,
	`input` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run` text,
	`next_run` text,
	`last_result` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text,
	`project_id` text,
	`title` text NOT NULL,
	`description` text,
	`priority` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`due_date` text,
	`tags` text,
	`completed_at` text,
	`objective` text,
	`assigned_agent_id` text,
	`parent_task_id` text,
	`dependencies` text DEFAULT '[]',
	`blocked_by` text DEFAULT '[]',
	`acceptance_criteria` text DEFAULT '[]',
	`artifacts` text DEFAULT '[]',
	`run_history` text DEFAULT '[]',
	`manual_intervention_required` integer DEFAULT false,
	`rollback_plan` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `agent_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tool_call_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`app_id` text,
	`source` text NOT NULL,
	`args` text,
	`result_success` integer,
	`result_data` text,
	`result_error` text,
	`risk` text,
	`confirmed_by_user` integer,
	`duration_ms` integer,
	`conversation_id` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`agent_profile_id` text NOT NULL,
	`role_in_workspace` text DEFAULT 'builder' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`current_task_id` text,
	`joined_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`left_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_profile_id`) REFERENCES `agent_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Default Workspace' NOT NULL,
	`description` text,
	`owner_id` text NOT NULL,
	`goal` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`active_project_id` text,
	`completed_at` text,
	`settings` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
