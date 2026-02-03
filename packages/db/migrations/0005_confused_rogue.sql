CREATE TABLE `achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`type` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`season_year` text,
	`unlocked_at` integer NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `season_history` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`season_year` text NOT NULL,
	`champion_team_id` text NOT NULL,
	`champion_team_name` text NOT NULL,
	`star_player_id` text NOT NULL,
	`star_player_name` text NOT NULL,
	`top_scorer_id` text NOT NULL,
	`top_scorer_name` text NOT NULL,
	`top_scorer_goals` integer NOT NULL,
	`top_assister_id` text NOT NULL,
	`top_assister_name` text NOT NULL,
	`top_assister_assists` integer NOT NULL,
	`player_team_id` text NOT NULL,
	`player_team_position` integer NOT NULL,
	`player_team_points` integer NOT NULL,
	`player_team_relegated` integer DEFAULT false,
	`relegated_team_ids` text NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `saves` ADD `game_over` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `saves` ADD `game_over_reason` text;