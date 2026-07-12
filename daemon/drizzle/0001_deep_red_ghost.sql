ALTER TABLE `agent_runs` ADD `agent_snapshot` text;--> statement-breakpoint
ALTER TABLE `executor_runs` ADD `attempt_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `executor_runs` ADD `native_session_id` text;--> statement-breakpoint
ALTER TABLE `executor_runs` ADD `native_turn_id` text;--> statement-breakpoint
ALTER TABLE `executor_runs` ADD `event_cursor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `executor_runs` ADD `heartbeat_at` text;--> statement-breakpoint
ALTER TABLE `executor_runs` ADD `lease_owner` text;--> statement-breakpoint
ALTER TABLE `executor_runs` ADD `lease_expires_at` text;