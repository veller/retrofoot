// ============================================================================
// AI Player Transformation
// ============================================================================
// Transforms real player data into fictional version using Claude

import Anthropic from '@anthropic-ai/sdk';
import type { RealPlayerData } from '../research/index.js';
import { REAL_TO_FICTIONAL } from './team-mapping.js';

const client = new Anthropic();

export interface FictionalPlayer {
  templateId: string;
  name: string;
  nickname?: string;
  realInspiration: string;
  teamId: string;
  position: 'GK' | 'DEF' | 'MID' | 'ATT';
  age: number;
  nationality: string;
  preferredFoot: 'left' | 'right' | 'both';
  attributes: {
    speed: number;
    strength: number;
    stamina: number;
    shooting: number;
    passing: number;
    dribbling: number;
    heading: number;
    tackling: number;
    positioning: number;
    vision: number;
    composure: number;
    aggression: number;
    reflexes: number;
    handling: number;
    diving: number;
  };
  potential: number;
  status: 'active';
  contractEndSeason: number;
  wage: number;
  marketValue: number;
}

/**
 * Transform real player data into a fictional player for RetroFoot
 */
export async function transformPlayer(
  realPlayer: RealPlayerData,
): Promise<FictionalPlayer> {
  // Map position to simplified system
  const position = mapPosition(realPlayer.position);

  // Map club to fictional version
  const teamId = mapTeam(realPlayer.club);

  // Generate fictional name with AI
  const { name, nickname, templateId } =
    await generateFictionalName(realPlayer);

  // Generate attributes based on position and rating
  const rating = realPlayer.rating || estimateRating(realPlayer);
  const attributes = generateAttributes(position, rating);

  // Calculate potential based on age
  const potential = calculatePotential(realPlayer.age, rating);

  // Calculate financials
  const marketValue =
    realPlayer.marketValue || calculateMarketValue(rating, realPlayer.age);
  const wage = calculateWage(rating);
  const contractEnd =
    realPlayer.contractEnd || 2026 + Math.floor(Math.random() * 3);

  return {
    templateId,
    name,
    nickname,
    realInspiration: realPlayer.fullName,
    teamId,
    position,
    age: realPlayer.age,
    nationality: realPlayer.nationality,
    preferredFoot: realPlayer.preferredFoot || 'right',
    attributes,
    potential,
    status: 'active',
    contractEndSeason: contractEnd,
    wage,
    marketValue,
  };
}

/**
 * Generate a fictional name using AI
 */
async function generateFictionalName(
  realPlayer: RealPlayerData,
): Promise<{ name: string; nickname?: string; templateId: string }> {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Generate a fictional football player name based on this real player:

Real name: ${realPlayer.fullName}
Nickname: ${realPlayer.nickname || 'None'}
Nationality: ${realPlayer.nationality}

Rules:
1. The fictional name should be similar but clearly different (not just add/remove a letter)
2. Keep the same nationality feel
3. If they have a nickname, create a similar but different nickname
4. The name should be funny/playful but not offensive
5. Portuguese speakers should find it amusing

Respond ONLY with JSON:
{
  "name": "string",
  "nickname": "string or null",
  "templateId": "lowercase-no-spaces-id"
}`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    if (textContent && textContent.type === 'text') {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return {
          name: data.name,
          nickname: data.nickname || undefined,
          templateId:
            data.templateId || data.name.toLowerCase().replace(/\s+/g, '-'),
        };
      }
    }
  } catch (error) {
    console.log('  [WARN] AI name generation failed, using fallback');
  }

  // Fallback: simple transformation
  const parts = realPlayer.fullName.split(' ');
  const name = parts
    .map((p) => p + 'inho')
    .slice(0, 2)
    .join(' ');
  return {
    name,
    nickname: realPlayer.nickname ? realPlayer.nickname + 'ito' : undefined,
    templateId: name.toLowerCase().replace(/\s+/g, '-'),
  };
}

/**
 * Map real position to simplified GK/DEF/MID/ATT
 */
function mapPosition(realPosition: string): 'GK' | 'DEF' | 'MID' | 'ATT' {
  const pos = realPosition.toLowerCase();

  if (pos.includes('keeper') || pos.includes('goleiro')) {
    return 'GK';
  }

  if (
    pos.includes('back') ||
    pos.includes('defender') ||
    pos.includes('zagueiro') ||
    pos.includes('lateral')
  ) {
    return 'DEF';
  }

  if (
    pos.includes('forward') ||
    pos.includes('striker') ||
    pos.includes('winger') ||
    pos.includes('atacante') ||
    pos.includes('centroavante') ||
    pos.includes('ponta')
  ) {
    return 'ATT';
  }

  // Default to midfielder for anything else
  return 'MID';
}

/**
 * Map real club name to fictional team ID
 */
function mapTeam(clubName: string): string {
  const normalized = clubName.toLowerCase().trim();

  for (const [key, value] of Object.entries(REAL_TO_FICTIONAL)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // Default to a random team if not found
  console.log(`  [WARN] Unknown club "${clubName}", defaulting to mengalvio`);
  return 'mengalvio';
}

/**
 * Estimate rating if not provided
 */
function estimateRating(player: RealPlayerData): number {
  // Base rating on market value if available
  if (player.marketValue) {
    if (player.marketValue >= 100_000_000) return 88;
    if (player.marketValue >= 50_000_000) return 84;
    if (player.marketValue >= 30_000_000) return 80;
    if (player.marketValue >= 15_000_000) return 76;
    if (player.marketValue >= 5_000_000) return 72;
    if (player.marketValue >= 1_000_000) return 68;
    return 65;
  }

  // Default based on age (peak performance age)
  if (player.age >= 24 && player.age <= 29) return 75;
  if (player.age >= 20 && player.age <= 23) return 70;
  if (player.age >= 30 && player.age <= 33) return 73;
  return 68;
}

/**
 * Generate attributes based on position and overall rating
 */
function generateAttributes(
  position: 'GK' | 'DEF' | 'MID' | 'ATT',
  overallRating: number,
): FictionalPlayer['attributes'] {
  const base = overallRating;
  const variance = () => Math.floor(Math.random() * 10) - 5; // -5 to +5

  const clamp = (v: number) => Math.max(1, Math.min(99, v));

  switch (position) {
    case 'GK':
      return {
        speed: clamp(base - 20 + variance()),
        strength: clamp(base - 5 + variance()),
        stamina: clamp(base - 10 + variance()),
        shooting: clamp(base - 40 + variance()),
        passing: clamp(base - 15 + variance()),
        dribbling: clamp(base - 30 + variance()),
        heading: clamp(base - 10 + variance()),
        tackling: clamp(base - 30 + variance()),
        positioning: clamp(base + variance()),
        vision: clamp(base - 20 + variance()),
        composure: clamp(base + variance()),
        aggression: clamp(base - 20 + variance()),
        reflexes: clamp(base + 5 + variance()),
        handling: clamp(base + 5 + variance()),
        diving: clamp(base + 5 + variance()),
      };

    case 'DEF':
      return {
        speed: clamp(base - 5 + variance()),
        strength: clamp(base + 5 + variance()),
        stamina: clamp(base + 5 + variance()),
        shooting: clamp(base - 20 + variance()),
        passing: clamp(base - 5 + variance()),
        dribbling: clamp(base - 10 + variance()),
        heading: clamp(base + 5 + variance()),
        tackling: clamp(base + 10 + variance()),
        positioning: clamp(base + 5 + variance()),
        vision: clamp(base - 10 + variance()),
        composure: clamp(base + variance()),
        aggression: clamp(base + 5 + variance()),
        reflexes: clamp(base - 30 + variance()),
        handling: clamp(base - 40 + variance()),
        diving: clamp(base - 40 + variance()),
      };

    case 'MID':
      return {
        speed: clamp(base + variance()),
        strength: clamp(base - 5 + variance()),
        stamina: clamp(base + 5 + variance()),
        shooting: clamp(base + variance()),
        passing: clamp(base + 10 + variance()),
        dribbling: clamp(base + 5 + variance()),
        heading: clamp(base - 10 + variance()),
        tackling: clamp(base + variance()),
        positioning: clamp(base + 5 + variance()),
        vision: clamp(base + 10 + variance()),
        composure: clamp(base + 5 + variance()),
        aggression: clamp(base - 5 + variance()),
        reflexes: clamp(base - 30 + variance()),
        handling: clamp(base - 40 + variance()),
        diving: clamp(base - 40 + variance()),
      };

    case 'ATT':
      return {
        speed: clamp(base + 5 + variance()),
        strength: clamp(base - 5 + variance()),
        stamina: clamp(base + variance()),
        shooting: clamp(base + 15 + variance()),
        passing: clamp(base - 5 + variance()),
        dribbling: clamp(base + 10 + variance()),
        heading: clamp(base + variance()),
        tackling: clamp(base - 25 + variance()),
        positioning: clamp(base + 10 + variance()),
        vision: clamp(base + variance()),
        composure: clamp(base + 10 + variance()),
        aggression: clamp(base + variance()),
        reflexes: clamp(base - 30 + variance()),
        handling: clamp(base - 40 + variance()),
        diving: clamp(base - 40 + variance()),
      };
  }
}

/**
 * Calculate potential based on age and current rating
 */
function calculatePotential(age: number, currentRating: number): number {
  if (age < 21) {
    // Young players have high potential
    return Math.min(99, currentRating + 15 + Math.floor(Math.random() * 10));
  }
  if (age < 24) {
    return Math.min(99, currentRating + 8 + Math.floor(Math.random() * 7));
  }
  if (age < 28) {
    return Math.min(99, currentRating + Math.floor(Math.random() * 5));
  }
  // Older players are near their peak
  return currentRating;
}

/**
 * Calculate market value based on rating and age
 */
function calculateMarketValue(rating: number, age: number): number {
  const baseValue = Math.pow(rating / 50, 4) * 1_000_000;

  let ageModifier = 1.0;
  if (age < 21) {
    ageModifier = 0.6 + (age - 17) * 0.1;
  } else if (age > 28) {
    ageModifier = 1.0 - (age - 28) * 0.1;
  }

  return Math.round((baseValue * ageModifier) / 10000) * 10000;
}

/**
 * Calculate wage based on rating
 */
function calculateWage(rating: number): number {
  const baseWage = Math.pow(rating / 50, 3) * 10000;
  return Math.round(baseWage / 100) * 100;
}
