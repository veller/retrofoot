// ============================================================================
// Team Mapping
// ============================================================================
// Maps real team names to fictional RetroFoot team IDs

/**
 * Map a real team name to our fictional team ID
 * Keep in sync with packages/core/src/data/teams.ts
 */
export const REAL_TO_FICTIONAL: Record<string, string> = {
  flamengo: 'mengalvio',
  palmeiras: 'palestra',
  corinthians: 'timao',
  'são paulo': 'trikas',
  'sao paulo': 'trikas',
  'atlético-mg': 'acmineiro',
  'atletico-mg': 'acmineiro',
  'atlético mineiro': 'acmineiro',
  'atletico mineiro': 'acmineiro',
  botafogo: 'putfire',
  fluminense: 'flordelince',
  internacional: 'colorado',
  inter: 'colorado',
  grêmio: 'gpa',
  gremio: 'gpa',
  cruzeiro: 'cabuloso',
  vasco: 'tdcolina',
  santos: 'baleia',
  bahia: 'esquadrao',
  'athletico-pr': 'paranaense',
  'athletico pr': 'paranaense',
  athletico: 'paranaense',
  'rb bragantino': 'massabruta',
  bragantino: 'massabruta',
  'red bull bragantino': 'massabruta',
  vitória: 'leaodabarra',
  vitoria: 'leaodabarra',
  coritiba: 'coxaverde',
  chapecoense: 'chapaquente',
  remo: 'leaoazul',
  mirassol: 'laranjamecanica',
};

/**
 * Get fictional team ID from real team name
 */
export function getFictionalTeamId(realTeamName: string): string | undefined {
  const normalized = realTeamName.toLowerCase().trim();

  for (const [key, value] of Object.entries(REAL_TO_FICTIONAL)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return undefined;
}
