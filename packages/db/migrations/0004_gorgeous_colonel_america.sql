DROP INDEX `idx_accounts_user_id`;--> statement-breakpoint
DROP INDEX `idx_fixtures_save_round`;--> statement-breakpoint
DROP INDEX `idx_fixtures_save_id`;--> statement-breakpoint
DROP INDEX `idx_match_events_fixture_id`;--> statement-breakpoint
DROP INDEX `idx_players_save_id`;--> statement-breakpoint
DROP INDEX `idx_players_team_id`;--> statement-breakpoint
DROP INDEX `idx_saves_user_id`;--> statement-breakpoint
DROP INDEX `idx_standings_save_season`;--> statement-breakpoint
DROP INDEX `idx_teams_save_id`;--> statement-breakpoint
DROP INDEX `idx_transactions_save_team`;--> statement-breakpoint
DROP INDEX `idx_transfer_listings_save_id`;--> statement-breakpoint
DROP INDEX `idx_transfer_listings_player_id`;--> statement-breakpoint
DROP INDEX `idx_transfer_listings_team_id`;--> statement-breakpoint
DROP INDEX `idx_transfer_listings_status`;--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_listings_save_player_unique` ON `transfer_listings` (`save_id`,`player_id`);--> statement-breakpoint
DROP INDEX `idx_transfer_offers_save_id`;--> statement-breakpoint
DROP INDEX `idx_transfer_offers_player_id`;--> statement-breakpoint
DROP INDEX `idx_transfer_offers_to_team_id`;--> statement-breakpoint
DROP INDEX `idx_transfer_offers_from_team_id`;--> statement-breakpoint
DROP INDEX `idx_transfer_offers_status`;