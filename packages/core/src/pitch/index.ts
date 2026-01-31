// ============================================================================
// RETROFOOT - Pitch Layout
// ============================================================================
// Formation slot coordinates for pitch visualization (x, y as 0-100%)
// View: top-down, our goal at bottom (low y), attacking toward top (high y)

import type { FormationType } from '../types'

export interface SlotCoordinate {
  x: number
  y: number
}

// Coordinates for each formation's 11 slots (in FORMATION_POSITIONS order)
const FORMATION_COORDINATES: Record<FormationType, SlotCoordinate[]> = {
  '4-4-2': [
    { x: 50, y: 8 },   // GK
    { x: 85, y: 18 },  // RB
    { x: 65, y: 18 },  // CB
    { x: 35, y: 18 },  // CB
    { x: 15, y: 18 },  // LB
    { x: 80, y: 42 },  // RM
    { x: 58, y: 42 },  // CM
    { x: 42, y: 42 },  // CM
    { x: 20, y: 42 },  // LM
    { x: 62, y: 78 },  // ST
    { x: 38, y: 78 },  // ST
  ],
  '4-3-3': [
    { x: 50, y: 8 },   // GK
    { x: 85, y: 18 },  // RB
    { x: 65, y: 18 },  // CB
    { x: 35, y: 18 },  // CB
    { x: 15, y: 18 },  // LB
    { x: 50, y: 32 },  // CDM
    { x: 65, y: 45 },  // CM
    { x: 35, y: 45 },  // CM
    { x: 85, y: 75 },  // RW
    { x: 50, y: 82 },  // ST
    { x: 15, y: 75 },  // LW
  ],
  '4-2-3-1': [
    { x: 50, y: 8 },   // GK
    { x: 85, y: 18 },  // RB
    { x: 65, y: 18 },  // CB
    { x: 35, y: 18 },  // CB
    { x: 15, y: 18 },  // LB
    { x: 62, y: 32 },  // CDM
    { x: 38, y: 32 },  // CDM
    { x: 80, y: 55 },  // RM
    { x: 50, y: 62 },  // CAM
    { x: 20, y: 55 },  // LM
    { x: 50, y: 85 },  // ST
  ],
  '3-5-2': [
    { x: 50, y: 8 },   // GK
    { x: 70, y: 18 },  // CB
    { x: 50, y: 18 },  // CB
    { x: 30, y: 18 },  // CB
    { x: 85, y: 42 },  // RM
    { x: 65, y: 42 },  // CM
    { x: 50, y: 35 },  // CDM
    { x: 35, y: 42 },  // CM
    { x: 15, y: 42 },  // LM
    { x: 62, y: 78 },  // ST
    { x: 38, y: 78 },  // ST
  ],
  '4-5-1': [
    { x: 50, y: 8 },   // GK
    { x: 85, y: 18 },  // RB
    { x: 65, y: 18 },  // CB
    { x: 35, y: 18 },  // CB
    { x: 15, y: 18 },  // LB
    { x: 82, y: 40 },  // RM
    { x: 58, y: 40 },  // CM
    { x: 50, y: 32 },  // CDM
    { x: 42, y: 40 },  // CM
    { x: 18, y: 40 },  // LM
    { x: 50, y: 82 },  // ST
  ],
  '5-3-2': [
    { x: 50, y: 8 },   // GK
    { x: 85, y: 18 },  // RB
    { x: 70, y: 18 },  // CB
    { x: 50, y: 18 },  // CB
    { x: 30, y: 18 },  // CB
    { x: 15, y: 18 },  // LB
    { x: 65, y: 42 },  // CM
    { x: 50, y: 35 },  // CDM
    { x: 35, y: 42 },  // CM
    { x: 62, y: 78 },  // ST
    { x: 38, y: 78 },  // ST
  ],
  '5-4-1': [
    { x: 50, y: 8 },   // GK
    { x: 90, y: 18 },  // RB
    { x: 72, y: 18 },  // CB
    { x: 50, y: 18 },  // CB
    { x: 28, y: 18 },  // CB
    { x: 10, y: 18 },  // LB
    { x: 80, y: 42 },  // RM
    { x: 58, y: 42 },  // CM
    { x: 42, y: 42 },  // CM
    { x: 20, y: 42 },  // LM
    { x: 50, y: 82 },  // ST
  ],
  '3-4-3': [
    { x: 50, y: 8 },   // GK
    { x: 70, y: 18 },  // CB
    { x: 50, y: 18 },  // CB
    { x: 30, y: 18 },  // CB
    { x: 85, y: 42 },  // RM
    { x: 58, y: 42 },  // CM
    { x: 42, y: 42 },  // CM
    { x: 15, y: 42 },  // LM
    { x: 85, y: 75 },  // RW
    { x: 50, y: 82 },  // ST
    { x: 15, y: 75 },  // LW
  ],
}

/**
 * Returns (x, y) coordinates for each of the 11 formation slots.
 * Coordinates are percentages (0-100) for positioning players on the pitch.
 * Order matches FORMATION_POSITIONS for the given formation.
 */
export function getFormationSlotCoordinates(formation: FormationType): SlotCoordinate[] {
  return [...FORMATION_COORDINATES[formation]]
}
