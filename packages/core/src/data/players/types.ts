// ============================================================================
// RETROFOOT - Player Seed Types
// ============================================================================

import type { Player } from '../../types';

/**
 * Seed data extends Player with template metadata
 */
export interface PlayerSeed
  extends Omit<
    Player,
    'id' | 'morale' | 'fitness' | 'energy' | 'injured' | 'injuryWeeks'
  > {
  templateId: string;
  realInspiration: string;
  teamId: string;
}
