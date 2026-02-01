CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`season` text NOT NULL,
	`round` integer NOT NULL,
	`home_team_id` text NOT NULL,
	`away_team_id` text NOT NULL,
	`date` text NOT NULL,
	`played` integer DEFAULT false,
	`home_score` integer,
	`away_score` integer,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_events` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`minute` integer NOT NULL,
	`type` text NOT NULL,
	`team` text NOT NULL,
	`player_id` text,
	`player_name` text,
	`description` text,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`team_id` text,
	`name` text NOT NULL,
	`nickname` text,
	`age` integer NOT NULL,
	`nationality` text NOT NULL,
	`position` text NOT NULL,
	`preferred_foot` text NOT NULL,
	`attributes` text NOT NULL,
	`potential` integer NOT NULL,
	`morale` integer DEFAULT 70,
	`fitness` integer DEFAULT 100,
	`injured` integer DEFAULT false,
	`injury_weeks` integer DEFAULT 0,
	`contract_end_season` integer NOT NULL,
	`wage` integer NOT NULL,
	`market_value` integer NOT NULL,
	`status` text DEFAULT 'active',
	`form` integer DEFAULT 70,
	`last_five_ratings` text DEFAULT '[]',
	`season_goals` integer DEFAULT 0,
	`season_assists` integer DEFAULT 0,
	`season_minutes` integer DEFAULT 0,
	`season_avg_rating` real DEFAULT 0,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `saves` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`player_team_id` text NOT NULL,
	`manager_name` text NOT NULL,
	`manager_reputation` integer DEFAULT 50,
	`current_season` text NOT NULL,
	`current_round` integer DEFAULT 1,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `standings` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`season` text NOT NULL,
	`team_id` text NOT NULL,
	`position` integer NOT NULL,
	`played` integer DEFAULT 0,
	`won` integer DEFAULT 0,
	`drawn` integer DEFAULT 0,
	`lost` integer DEFAULT 0,
	`goals_for` integer DEFAULT 0,
	`goals_against` integer DEFAULT 0,
	`points` integer DEFAULT 0,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tactics` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`team_id` text NOT NULL,
	`formation` text NOT NULL,
	`posture` text NOT NULL,
	`lineup` text NOT NULL,
	`substitutes` text NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`badge_url` text,
	`primary_color` text NOT NULL,
	`secondary_color` text NOT NULL,
	`stadium` text NOT NULL,
	`capacity` integer NOT NULL,
	`reputation` integer NOT NULL,
	`budget` integer NOT NULL,
	`wage_budget` integer NOT NULL,
	`momentum` integer DEFAULT 50,
	`last_five_results` text DEFAULT '[]',
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`player_id` text NOT NULL,
	`from_team_id` text,
	`to_team_id` text,
	`fee` integer NOT NULL,
	`wage` integer NOT NULL,
	`season` text NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false,
	`name` text,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
