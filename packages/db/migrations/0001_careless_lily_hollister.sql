CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`team_id` text NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text,
	`round` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `teams` ADD `balance` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `teams` ADD `round_wages` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `teams` ADD `season_revenue` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `teams` ADD `season_expenses` integer DEFAULT 0;