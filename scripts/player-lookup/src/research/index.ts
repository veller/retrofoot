// ============================================================================
// Player Research Module
// ============================================================================
// Combines data from multiple sources to build a complete player profile

import { searchTransfermarkt } from './transfermarkt.js';
import { searchWithAI } from './ai-search.js';

export interface RealPlayerData {
  fullName: string;
  shortName: string;
  nickname?: string;
  club: string;
  position: string; // Original position (e.g., "Centre-Forward", "Central Midfield")
  age: number;
  nationality: string;
  preferredFoot?: 'left' | 'right' | 'both';
  marketValue?: number; // In euros
  wage?: number;
  contractEnd?: number;
  rating?: number; // 1-100 or 1-10 depending on source
  // Stats for attribute generation
  stats?: {
    goals?: number;
    assists?: number;
    appearances?: number;
    avgRating?: number;
  };
}

/**
 * Research a player by name, combining data from multiple sources
 */
export async function researchPlayer(
  name: string,
  teamFilter?: string,
): Promise<RealPlayerData | null> {
  console.log('  - Searching Transfermarkt...');

  // Try Transfermarkt first (most reliable for basic data)
  const tmData = await searchTransfermarkt(name, teamFilter);

  if (tmData) {
    console.log('  [OK] Transfermarkt: Found');

    // Enhance with AI search for additional details
    console.log('  - Searching for additional details...');
    const aiData = await searchWithAI(name, tmData);

    if (aiData?.nickname) {
      console.log(`  [OK] Found nickname: "${aiData.nickname}"`);
      tmData.nickname = aiData.nickname;
    }

    if (aiData?.rating && !tmData.rating) {
      tmData.rating = aiData.rating;
    }

    return tmData;
  }

  // Fallback: Use AI to search and compile data
  console.log('  - Transfermarkt not found, using AI search...');
  const aiOnlyData = await searchWithAI(name);

  if (aiOnlyData) {
    console.log('  [OK] AI search: Found');
    return aiOnlyData;
  }

  return null;
}
