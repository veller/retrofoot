// ============================================================================
// Transfermarkt Scraper
// ============================================================================
// Scrapes player data from Transfermarkt

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { RealPlayerData } from './index.js';

const BASE_URL = 'https://www.transfermarkt.com';
const SEARCH_URL = `${BASE_URL}/schnellsuche/ergebnis/schnellsuche`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

/**
 * Search for a player on Transfermarkt
 */
export async function searchTransfermarkt(
  name: string,
  teamFilter?: string,
): Promise<RealPlayerData | null> {
  try {
    // Search for the player
    const searchResponse = await axios.get(SEARCH_URL, {
      params: { query: name },
      headers: HEADERS,
      timeout: 10000,
    });

    const $ = cheerio.load(searchResponse.data);

    // Find player links - TM changed their structure, use href-based selector
    const playerLinks = $('a[href*="/profil/spieler/"]');

    if (playerLinks.length === 0) {
      return null;
    }

    // Get the first matching player (or filter by team)
    let playerUrl: string | null = null;
    let foundPlayerName: string | null = null;

    playerLinks.each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const playerName = $el.text().trim();

      // Skip empty or very short names (likely icons/images)
      if (!playerName || playerName.length < 3) {
        return; // continue
      }

      if (teamFilter) {
        // For team filtering, we need to check parent row
        const parentRow = $el.closest('tr');
        const rowTeam = parentRow.find('img[alt]').attr('alt') || '';

        if (rowTeam.toLowerCase().includes(teamFilter.toLowerCase())) {
          playerUrl = href || null;
          foundPlayerName = playerName;
          return false; // break
        }
      } else {
        playerUrl = href || null;
        foundPlayerName = playerName;
        return false; // break
      }
    });

    if (!playerUrl) {
      return null;
    }

    // Fetch full player profile
    const profileUrl = `${BASE_URL}${playerUrl}`;
    const profileResponse = await axios.get(profileUrl, {
      headers: HEADERS,
      timeout: 10000,
    });

    const $profile = cheerio.load(profileResponse.data);

    // Extract data from profile - try multiple selectors for resilience
    const fullName =
      $profile('h1').first().text().trim() ||
      $profile('.data-header__headline-wrapper').text().trim() ||
      foundPlayerName ||
      name;

    // Clean up the name (remove jersey numbers, etc.)
    const cleanName = fullName.replace(/^#\d+\s*/, '').trim();

    // Extract position and clean it up
    let position =
      $profile('.detail-position__position').text().trim() ||
      $profile('span:contains("Position:")')
        .parent()
        .text()
        .replace('Position:', '')
        .trim() ||
      $profile('dd:contains("Position")').next().text().trim() ||
      'Midfielder';

    // Clean up position text (remove "Other position:" and extra whitespace)
    position = position.split('\n')[0].trim();
    position = position.replace(/Other position:.*$/s, '').trim();

    const club =
      $profile('.data-header__club a').first().text().trim() ||
      $profile('span[itemprop="affiliation"]').text().trim() ||
      '';

    // Get nationality from flag image in the header
    let nationality = 'Unknown';
    // Look for the flag in the data header content
    const headerFlags = $profile(
      '.data-header__content .flaggenrahmen, .data-header__info-box .flaggenrahmen',
    );
    if (headerFlags.length) {
      nationality =
        headerFlags.first().attr('title') ||
        headerFlags.first().attr('alt') ||
        'Unknown';
    } else {
      // Try any flag image on page
      const anyFlag = $profile('img.flaggenrahmen').first();
      nationality = anyFlag.attr('title') || anyFlag.attr('alt') || 'Unknown';
    }

    // Parse age from date of birth or direct age display
    let age = 25; // default
    const ageText = $profile('span[itemprop="birthDate"]').text().trim();
    const ageMatch = ageText.match(/\((\d+)\)/);
    if (ageMatch) {
      age = parseInt(ageMatch[1], 10);
    } else {
      // Try to find age directly
      const directAge = $profile('span:contains("Age:")').parent().text();
      const directAgeMatch = directAge.match(/(\d+)/);
      if (directAgeMatch) {
        age = parseInt(directAgeMatch[1], 10);
      }
    }

    // Parse market value
    const marketValueText =
      $profile('.data-header__market-value-wrapper').text().trim() ||
      $profile('a[href*="marktwert"]').text().trim();
    const marketValue = parseMarketValue(marketValueText);

    // Parse preferred foot
    const footText =
      $profile('span:contains("Foot:")').parent().text().toLowerCase() ||
      $profile('li:contains("foot")').text().toLowerCase();
    const preferredFoot = footText.includes('left')
      ? 'left'
      : footText.includes('both')
        ? 'both'
        : 'right';

    // Parse contract end
    const contractText = $profile('span:contains("Contract expires:")')
      .parent()
      .text();
    const contractEnd = parseContractEnd(contractText);

    return {
      fullName: cleanName,
      shortName: extractShortName(cleanName),
      club,
      position,
      age,
      nationality,
      preferredFoot,
      marketValue,
      contractEnd,
    };
  } catch (error) {
    // Silently fail and return null - we'll try other sources
    if (axios.isAxiosError(error)) {
      if (error.code !== 'ECONNABORTED') {
        console.log(`  [WARN] Transfermarkt request failed: ${error.message}`);
      }
    }
    return null;
  }
}

/**
 * Parse market value string to number (in euros)
 */
function parseMarketValue(text: string): number | undefined {
  if (!text) return undefined;

  const cleanText = text.replace(/[€$£]/g, '').trim().toLowerCase();
  const match = cleanText.match(/([\d.,]+)\s*(m|k|bn|million|thousand)?/i);

  if (!match) return undefined;

  let value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2]?.toLowerCase();

  if (unit === 'bn') value *= 1_000_000_000;
  else if (unit === 'm' || unit === 'million') value *= 1_000_000;
  else if (unit === 'k' || unit === 'thousand') value *= 1_000;

  return Math.round(value);
}

/**
 * Parse contract end year from text
 */
function parseContractEnd(text: string): number | undefined {
  const match = text.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extract short name from full name
 */
function extractShortName(fullName: string): string {
  const parts = fullName.split(' ');
  if (parts.length === 1) return fullName;

  // Return first name + last name
  return `${parts[0]} ${parts[parts.length - 1]}`;
}
