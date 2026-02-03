// ============================================================================
// RETROFOOT - UI Utilities
// ============================================================================
// Shared utility functions for UI components

/**
 * Get the color class for a player's overall rating
 */
export function getOverallColor(overall: number): string {
  if (overall >= 80) return 'text-amber-400';
  if (overall >= 70) return 'text-pitch-400';
  if (overall >= 60) return 'text-blue-400';
  return 'text-slate-400';
}
