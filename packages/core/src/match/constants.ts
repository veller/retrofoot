// ============================================================================
// RETROFOOT - Match Simulation Constants
// ============================================================================
// All tunable parameters for match simulation

// Core probabilities
export const EVENT_PROBABILITY_PER_MINUTE = 0.15;
export const BASE_GOAL_CONVERSION = 0.3;
export const MIN_GOAL_CONVERSION = 0.05;
export const MAX_GOAL_CONVERSION = 0.6;

// Home advantage
export const HOME_POSSESSION_BONUS = 0.08;
export const HOME_CONVERSION_BONUS = 0.05;

// Form and momentum
export const PLAYER_FORM_WEIGHT = 0.1;
export const NEUTRAL_FORM = 70;
export const TEAM_MOMENTUM_WEIGHT = 0.08;
export const NEUTRAL_MOMENTUM = 50;

// Streaks
export const STRIKER_DROUGHT_THRESHOLD = 5;
export const STRIKER_DROUGHT_PENALTY = 0.05;
export const STRIKER_HOT_STREAK_BONUS = 0.08;
export const GK_CLEAN_SHEET_BONUS = 0.05;

// Fitness
export const FITNESS_THRESHOLD = 80;
export const FITNESS_PENALTY_FACTOR = 0.01;
export const LATE_GAME_FITNESS_MINUTE = 60;

// Energy (match fatigue)
export const LIVE_ENERGY_DRAIN_BASE_PER_MINUTE = 0.14;
export const ENERGY_PENALTY_MAX = 0.4;

// Set pieces
export const CORNER_GOAL_RATE = 0.03;
export const FREE_KICK_GOAL_RATE = 0.05;

// Red cards
export const RED_CARD_STRENGTH_PENALTY = 8;

// Event thresholds (cumulative probabilities)
export const EVENT_THRESHOLD_ATTACKING_CHANCE = 0.4;
export const EVENT_THRESHOLD_YELLOW_CARD = 0.55;
export const EVENT_THRESHOLD_RED_CARD = 0.58;
export const EVENT_THRESHOLD_CORNER = 0.65;
export const EVENT_THRESHOLD_FREE_KICK = 0.72;
export const EVENT_THRESHOLD_SAVE = 0.8;
