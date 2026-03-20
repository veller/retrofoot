CREATE TABLE `round_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`round` integer NOT NULL,
	`status` text DEFAULT 'locked' NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `round_locks_save_round_unique` ON `round_locks` (`save_id`,`round`);