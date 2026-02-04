// ============================================================================
// RETROFOOT - Transfer Market Configuration
// ============================================================================
// Configurable parameters for transfer market behavior

/**
 * Configuration for transfer market behavior
 * All values can be tuned to adjust market activity levels
 */
export interface TransferConfig {
  // Timing
  /** Number of rounds before an offer expires */
  offerExpiryRounds: number;

  // AI Buying Behavior
  /** Maximum number of offers an AI team can make per round */
  maxOffersPerTeamPerRound: number;
  /** Percentage of asking price to offer (0.0 - 1.0) */
  offerPriceRatio: number;
  /** Maximum percentage of budget to spend on one player (0.0 - 1.0) */
  maxBudgetSpendRatio: number;
  /** Maximum percentage of wage budget for one player (0.0 - 1.0) */
  maxWageAllocationRatio: number;
  /** Minimum overall relative to team average for AI buys */
  buyQualityThreshold: number;
  /** Base probability (0.0 - 1.0) that AI will make an offer when eligible */
  baseOfferProbability: number;
  /** Whether AI can buy players to upgrade existing positions (not just fill gaps) */
  allowPositionUpgrades: boolean;
  /** Minimum overall difference above position average to trigger an upgrade purchase */
  upgradeQualityThreshold: number;

  // AI Selling Behavior
  /** Accept offer if >= this percentage of asking price (0.0 - 1.0)
   * Note: Use 0.995 to allow for display rounding (322K might be 322,500) */
  acceptThreshold: number;
  /** Accept offer if overstaffed and >= this percentage (0.0 - 1.0) */
  overstaffedAcceptThreshold: number;
  /** Counter offer if >= this percentage of asking price (0.0 - 1.0) */
  counterThreshold: number;

  // Squad Composition
  /** Target squad size for AI decisions */
  idealSquadSize: number;

  // Youth Evaluation
  /** Weight for potential in youth evaluation (0-1), applied for players under 25 */
  potentialWeightForYouth: number;
}

/**
 * Default transfer configuration
 * Tuned for active but realistic market behavior
 */
export const DEFAULT_TRANSFER_CONFIG: TransferConfig = {
  offerExpiryRounds: 3,
  maxOffersPerTeamPerRound: 3,
  offerPriceRatio: 0.9,
  maxBudgetSpendRatio: 0.85,
  maxWageAllocationRatio: 0.2,
  buyQualityThreshold: -15,
  baseOfferProbability: 0.7,
  allowPositionUpgrades: true,
  upgradeQualityThreshold: 6,
  acceptThreshold: 0.995, // 0.5% tolerance for display rounding
  overstaffedAcceptThreshold: 0.8,
  counterThreshold: 0.75,
  idealSquadSize: 28,
  potentialWeightForYouth: 0.5,
};

/**
 * Presets for different market activity levels
 */
export const TRANSFER_PRESETS = {
  /** Low activity: conservative AI, fewer deals */
  low: {
    ...DEFAULT_TRANSFER_CONFIG,
    maxOffersPerTeamPerRound: 1,
    offerPriceRatio: 0.85,
    maxBudgetSpendRatio: 0.5,
    maxWageAllocationRatio: 0.1,
    buyQualityThreshold: -5,
    baseOfferProbability: 0.4,
    allowPositionUpgrades: false,
    counterThreshold: 0.85,
    potentialWeightForYouth: 0.3,
  } as TransferConfig,

  /** Normal activity: balanced market behavior */
  normal: DEFAULT_TRANSFER_CONFIG,

  /** High activity: aggressive AI, more deals */
  high: {
    ...DEFAULT_TRANSFER_CONFIG,
    maxOffersPerTeamPerRound: 3,
    offerPriceRatio: 0.95,
    maxBudgetSpendRatio: 0.8,
    maxWageAllocationRatio: 0.2,
    buyQualityThreshold: -15,
    baseOfferProbability: 0.75,
    upgradeQualityThreshold: 5,
    overstaffedAcceptThreshold: 0.7,
    counterThreshold: 0.65,
    potentialWeightForYouth: 0.7,
  } as TransferConfig,
};

export type TransferPreset = keyof typeof TRANSFER_PRESETS;
