ALTER TABLE `players` ADD COLUMN `yellow_accumulation` integer DEFAULT 0;
ALTER TABLE `players` ADD COLUMN `suspension_matches_remaining` integer DEFAULT 0;
ALTER TABLE `players` ADD COLUMN `season_yellow_cards` integer DEFAULT 0;
ALTER TABLE `players` ADD COLUMN `season_red_cards` integer DEFAULT 0;
ALTER TABLE `saves` ADD COLUMN `discipline_preset` text DEFAULT 'domestic_5yc';
