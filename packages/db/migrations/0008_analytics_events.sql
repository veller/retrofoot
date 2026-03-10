CREATE TABLE `analytics_events` (
  `id` text PRIMARY KEY NOT NULL,
  `event_name` text NOT NULL,
  `user_id` text NOT NULL,
  `save_id` text,
  `payload` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `analytics_events_user_id_idx` ON `analytics_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `analytics_events_save_id_idx` ON `analytics_events` (`save_id`);
--> statement-breakpoint
CREATE INDEX `analytics_events_event_name_created_at_user_idx` ON `analytics_events` (`event_name`,`created_at`,`user_id`);
