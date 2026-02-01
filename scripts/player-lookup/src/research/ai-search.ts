// ============================================================================
// AI-Powered Player Search
// ============================================================================
// Uses Claude to search for player information as a fallback/enhancement

import Anthropic from '@anthropic-ai/sdk';
import type { RealPlayerData } from './index.js';

const client = new Anthropic();

/**
 * Search for player details using AI
 * Can be used as a fallback or to enhance existing data
 */
export async function searchWithAI(
  playerName: string,
  existingData?: Partial<RealPlayerData>,
): Promise<RealPlayerData | null> {
  try {
    const prompt = existingData
      ? buildEnhancementPrompt(playerName, existingData)
      : buildFullSearchPrompt(playerName);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return null;
    }

    // Parse JSON response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const data = JSON.parse(jsonMatch[0]);

    if (existingData) {
      // Return just the enhanced fields
      return {
        ...existingData,
        nickname: data.nickname || existingData.nickname,
        rating: data.rating || existingData.rating,
        stats: data.stats || existingData.stats,
      } as RealPlayerData;
    }

    // Return full data
    return {
      fullName: data.fullName || playerName,
      shortName: data.shortName || playerName,
      nickname: data.nickname,
      club: data.club || 'Unknown',
      position: data.position || 'Midfielder',
      age: data.age || 25,
      nationality: data.nationality || 'Brazil',
      preferredFoot: data.preferredFoot || 'right',
      marketValue: data.marketValue,
      rating: data.rating,
      stats: data.stats,
    };
  } catch (error) {
    console.log(
      '  [WARN] AI search failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return null;
  }
}

function buildEnhancementPrompt(
  playerName: string,
  existingData: Partial<RealPlayerData>,
): string {
  return `I have data about the football player "${playerName}" who plays for ${existingData.club || 'unknown club'}.

I need additional information that I couldn't find. Please provide:
1. Their nickname (if they have one commonly used by fans/media)
2. Their approximate overall rating on a scale of 1-99 (like FIFA ratings)
3. Any notable season statistics

Respond ONLY with a JSON object in this exact format:
{
  "nickname": "string or null",
  "rating": number (1-99),
  "stats": {
    "goals": number or null,
    "assists": number or null,
    "appearances": number or null
  }
}`;
}

function buildFullSearchPrompt(playerName: string): string {
  return `I need information about the football player "${playerName}".

Please search your knowledge and provide:
- Full name
- Current club (especially if in Brazilian Serie A)
- Position
- Age
- Nationality
- Preferred foot
- Estimated market value in euros
- Nickname (if any)
- Approximate overall rating (1-99 scale like FIFA)

Respond ONLY with a JSON object in this exact format:
{
  "fullName": "string",
  "shortName": "string",
  "nickname": "string or null",
  "club": "string",
  "position": "string (e.g., Centre-Forward, Central Midfield, Goalkeeper)",
  "age": number,
  "nationality": "string",
  "preferredFoot": "left" | "right" | "both",
  "marketValue": number (in euros),
  "rating": number (1-99),
  "stats": {
    "goals": number or null,
    "assists": number or null
  }
}`;
}
