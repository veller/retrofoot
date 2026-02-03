-- Transfer Market tables migration
-- Adds transfer_listings and transfer_offers tables for the transfer market feature

CREATE TABLE `transfer_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`player_id` text NOT NULL,
	`team_id` text,
	`asking_price` integer NOT NULL,
	`status` text NOT NULL,
	`listed_round` integer NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transfer_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`player_id` text NOT NULL,
	`from_team_id` text,
	`to_team_id` text NOT NULL,
	`offer_amount` integer NOT NULL,
	`offered_wage` integer NOT NULL,
	`contract_years` integer NOT NULL,
	`status` text NOT NULL,
	`counter_amount` integer,
	`counter_wage` integer,
	`created_round` integer NOT NULL,
	`expires_round` integer NOT NULL,
	`responded_round` integer,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Indexes for transfer_listings
CREATE INDEX idx_transfer_listings_save_id ON transfer_listings(save_id);
CREATE INDEX idx_transfer_listings_player_id ON transfer_listings(player_id);
CREATE INDEX idx_transfer_listings_team_id ON transfer_listings(team_id);
CREATE INDEX idx_transfer_listings_status ON transfer_listings(save_id, status);
--> statement-breakpoint
-- Indexes for transfer_offers
CREATE INDEX idx_transfer_offers_save_id ON transfer_offers(save_id);
CREATE INDEX idx_transfer_offers_player_id ON transfer_offers(player_id);
CREATE INDEX idx_transfer_offers_to_team_id ON transfer_offers(to_team_id);
CREATE INDEX idx_transfer_offers_from_team_id ON transfer_offers(from_team_id);
CREATE INDEX idx_transfer_offers_status ON transfer_offers(save_id, status);
