#!/usr/bin/env node
// ============================================================================
// RETROFOOT - Player Lookup Tool
// ============================================================================
// AI-powered tool to research real players and generate fictional versions

import { Command } from 'commander';
import { config } from 'dotenv';
import { researchPlayer } from './research/index.js';
import { transformPlayer } from './ai/transform.js';
import { generateTypeScript } from './output/typescript.js';
import { appendToPlayerFile } from './output/file.js';
import * as readline from 'readline';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from the script directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const program = new Command();

program
  .name('player-lookup')
  .description(
    'Research real players and generate fictional versions for RetroFoot',
  )
  .version('1.0.0');

program
  .command('lookup')
  .description('Look up a player and generate fictional version')
  .argument('<name>', 'Player name to look up')
  .option('-t, --team <team>', 'Filter by team name')
  .option('-y, --yes', 'Auto-confirm without prompting')
  .action(async (name: string, options: { team?: string; yes?: boolean }) => {
    try {
      console.log(`\nResearching "${name}"...`);

      // Step 1: Research the player
      const realPlayerData = await researchPlayer(name, options.team);

      if (!realPlayerData) {
        console.error(
          'Could not find player data. Please try a different name.',
        );
        process.exit(1);
      }

      console.log('\nReal Player Data:');
      console.log(`  Name: ${realPlayerData.fullName}`);
      console.log(`  Club: ${realPlayerData.club}`);
      console.log(`  Position: ${realPlayerData.position}`);
      console.log(`  Age: ${realPlayerData.age}`);
      console.log(`  Nationality: ${realPlayerData.nationality}`);
      console.log(
        `  Market Value: €${realPlayerData.marketValue?.toLocaleString() ?? 'Unknown'}`,
      );
      if (realPlayerData.nickname) {
        console.log(`  Nickname: ${realPlayerData.nickname}`);
      }
      if (realPlayerData.rating) {
        console.log(`  Rating: ${realPlayerData.rating}`);
      }

      // Step 2: Transform to fictional version with AI
      console.log('\nGenerating fictional version with AI...');
      const fictionalPlayer = await transformPlayer(realPlayerData);

      console.log(
        `\nSuggested: "${fictionalPlayer.name}"${fictionalPlayer.nickname ? ` (nickname: "${fictionalPlayer.nickname}")` : ''}`,
      );

      // Step 3: Generate TypeScript
      const tsCode = generateTypeScript(fictionalPlayer);
      console.log('\n' + tsCode);

      // Step 4: Confirm and save
      if (options.yes) {
        await appendToPlayerFile(fictionalPlayer);
        console.log('\nDone! Player added.');
      } else {
        const confirmed = await confirm(
          `\nAdd to packages/core/src/data/players/${fictionalPlayer.teamId}.ts?`,
        );
        if (confirmed) {
          await appendToPlayerFile(fictionalPlayer);
          console.log('\nDone! Player added.');
        } else {
          console.log('\nCancelled.');
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('team')
  .description('Generate all players for a team')
  .argument('<team>', 'Real team name (e.g., "Palmeiras")')
  .option('--limit <n>', 'Limit number of players', '25')
  .action(async (team: string, options: { limit: string }) => {
    console.log(`\nFetching ${team} squad...`);
    console.log(
      '(Team batch mode not yet implemented - use individual lookup for now)',
    );
    // TODO: Implement batch mode
  });

program.parse();

// Helper function for confirmation prompt
function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
