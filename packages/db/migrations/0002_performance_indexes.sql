-- Performance indexes for RetroFoot API
-- This migration adds indexes to optimize common query patterns

-- Critical indexes for filtering by saveId
CREATE INDEX idx_teams_save_id ON teams(save_id);
CREATE INDEX idx_players_save_id ON players(save_id);
CREATE INDEX idx_players_team_id ON players(team_id);

-- Composite indexes for common query patterns
CREATE INDEX idx_standings_save_season ON standings(save_id, season);
CREATE INDEX idx_fixtures_save_round ON fixtures(save_id, round);
CREATE INDEX idx_fixtures_save_id ON fixtures(save_id);
CREATE INDEX idx_match_events_fixture_id ON match_events(fixture_id);
CREATE INDEX idx_transactions_save_team ON transactions(save_id, team_id);

-- Auth related
CREATE INDEX idx_saves_user_id ON saves(user_id);
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
