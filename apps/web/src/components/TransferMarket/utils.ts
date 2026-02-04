// ============================================================================
// RETROFOOT - Transfer Market Utilities
// ============================================================================
// Shared helper functions for transfer market components

/**
 * Get the smart increment value based on the current value
 * Used for +/- buttons on monetary inputs
 */
export function getSmartIncrement(value: number): number {
  if (value >= 10_000_000) return 1_000_000; // 10M+ -> +/-1M
  if (value >= 1_000_000) return 100_000; // 1M+ -> +/-100K
  if (value >= 100_000) return 10_000; // 100K+ -> +/-10K
  return 1_000; // Below 100K -> +/-1K
}

/**
 * Parse monetary input that may include K or M suffixes
 * Examples: "1.5M" -> 1500000, "500K" -> 500000, "100000" -> 100000
 */
export function parseMonetaryInput(input: string): number {
  const lower = input.toLowerCase().replace(/[^0-9.km]/g, '');
  const num = parseFloat(lower.replace(/[km]/g, ''));
  if (isNaN(num)) return 0;
  if (lower.includes('m')) return Math.round(num * 1_000_000);
  if (lower.includes('k')) return Math.round(num * 1_000);
  return Math.round(num);
}

/**
 * Round a number to the nearest thousand for cleaner UX
 */
export function roundToThousand(n: number): number {
  return Math.round(n / 1000) * 1000;
}
