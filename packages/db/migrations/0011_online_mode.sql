CREATE TABLE `online_leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`host_user_id` text NOT NULL,
	`invite_code` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`max_members` integer DEFAULT 8 NOT NULL,
	`settings` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`host_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `online_leagues_invite_code_unique` ON `online_leagues` (`invite_code`);
--> statement-breakpoint
CREATE INDEX `online_leagues_host_user_id_idx` ON `online_leagues` (`host_user_id`);
--> statement-breakpoint
CREATE INDEX `online_leagues_status_idx` ON `online_leagues` (`status`);
--> statement-breakpoint
CREATE TABLE `online_league_members` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`user_id` text NOT NULL,
	`online_team_id` text,
	`role` text DEFAULT 'player' NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `online_leagues`(`id`) ON DELETE CASCADE ON UPDATE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `online_league_members_league_user_unique` ON `online_league_members` (`league_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `online_league_members_league_id_idx` ON `online_league_members` (`league_id`);
--> statement-breakpoint
CREATE INDEX `online_league_members_user_id_idx` ON `online_league_members` (`user_id`);
--> statement-breakpoint
CREATE TABLE `online_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
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
	FOREIGN KEY (`league_id`) REFERENCES `online_leagues`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `online_teams_league_id_idx` ON `online_teams` (`league_id`);
--> statement-breakpoint
CREATE TABLE `online_players` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
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
	`energy` integer DEFAULT 100,
	`injured` integer DEFAULT false,
	`injury_weeks` integer DEFAULT 0,
	`contract_end_season` integer NOT NULL,
	`wage` integer NOT NULL,
	`market_value` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `online_leagues`(`id`) ON DELETE CASCADE ON UPDATE no action,
	FOREIGN KEY (`team_id`) REFERENCES `online_teams`(`id`) ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `online_players_league_id_idx` ON `online_players` (`league_id`);
--> statement-breakpoint
CREATE INDEX `online_players_team_id_idx` ON `online_players` (`team_id`);
--> statement-breakpoint
CREATE TABLE `online_standings` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`season_label` text NOT NULL,
	`team_id` text NOT NULL,
	`position` integer NOT NULL,
	`played` integer DEFAULT 0,
	`won` integer DEFAULT 0,
	`drawn` integer DEFAULT 0,
	`lost` integer DEFAULT 0,
	`goals_for` integer DEFAULT 0,
	`goals_against` integer DEFAULT 0,
	`points` integer DEFAULT 0,
	FOREIGN KEY (`league_id`) REFERENCES `online_leagues`(`id`) ON DELETE CASCADE ON UPDATE no action,
	FOREIGN KEY (`team_id`) REFERENCES `online_teams`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `online_standings_league_team_season_unique` ON `online_standings` (`league_id`,`season_label`,`team_id`);
--> statement-breakpoint
CREATE INDEX `online_standings_league_id_idx` ON `online_standings` (`league_id`);
--> statement-breakpoint
CREATE TABLE `online_fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`season_label` text NOT NULL,
	`round` integer NOT NULL,
	`home_team_id` text NOT NULL,
	`away_team_id` text NOT NULL,
	`kickoff_at` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`played` integer DEFAULT false,
	`home_score` integer,
	`away_score` integer,
	FOREIGN KEY (`league_id`) REFERENCES `online_leagues`(`id`) ON DELETE CASCADE ON UPDATE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `online_teams`(`id`) ON DELETE CASCADE ON UPDATE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `online_teams`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `online_fixtures_league_id_idx` ON `online_fixtures` (`league_id`);
--> statement-breakpoint
CREATE INDEX `online_fixtures_league_round_idx` ON `online_fixtures` (`league_id`,`round`);
--> statement-breakpoint
CREATE TABLE `online_match_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`durable_object_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`rng_seed` text,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`fixture_id`) REFERENCES `online_fixtures`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `online_match_sessions_fixture_id_unique` ON `online_match_sessions` (`fixture_id`);
--> statement-breakpoint
CREATE INDEX `online_match_sessions_fixture_id_idx` ON `online_match_sessions` (`fixture_id`);
--> statement-breakpoint
CREATE TABLE `online_tactics` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`team_id` text NOT NULL,
	`formation` text NOT NULL,
	`posture` text NOT NULL,
	`lineup` text NOT NULL,
	`substitutes` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `online_leagues`(`id`) ON DELETE CASCADE ON UPDATE no action,
	FOREIGN KEY (`team_id`) REFERENCES `online_teams`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `online_tactics_league_team_unique` ON `online_tactics` (`league_id`,`team_id`);
--> statement-breakpoint
CREATE TABLE `online_match_events` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`minute` integer NOT NULL,
	`type` text NOT NULL,
	`team` text NOT NULL,
	`player_id` text,
	`player_name` text,
	`description` text,
	FOREIGN KEY (`fixture_id`) REFERENCES `online_fixtures`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `online_match_events_fixture_id_idx` ON `online_match_events` (`fixture_id`);
--> statement-breakpoint
CREATE TABLE `online_analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_name` text NOT NULL,
	`user_id` text NOT NULL,
	`online_league_id` text,
	`online_fixture_id` text,
	`online_match_session_id` text,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `online_analytics_events_user_id_idx` ON `online_analytics_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `online_analytics_events_league_id_idx` ON `online_analytics_events` (`online_league_id`);
--> statement-breakpoint
CREATE INDEX `online_analytics_events_name_created_user_idx` ON `online_analytics_events` (`event_name`,`created_at`,`user_id`);
