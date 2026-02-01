// ============================================================================
// RETROFOOT - Team Seed Data
// ============================================================================
// 20 fictional Brazilian Serie A teams (based on real clubs)
// These are templates - actual game data is copied to the database

export interface TeamSeed {
  id: string;
  name: string;
  shortName: string;
  /** Dev reference only - not stored in DB */
  realInspiration: string;
  primaryColor: string;
  secondaryColor: string;
  stadium: string;
  capacity: number;
  reputation: number; // 1-100
  budget: number; // Transfer budget in currency
  wageBudget: number; // Weekly wage budget
}

/**
 * All 20 teams for Brazilian Serie A 2026
 * Sorted by reputation (strongest first)
 */
export const TEAMS: TeamSeed[] = [
  // Tier 1 - Elite clubs (reputation 85-95)
  {
    id: 'mengalvio',
    name: 'Mengalvio FC',
    shortName: 'MEN',
    realInspiration: 'Flamengo',
    primaryColor: '#B8002A',
    secondaryColor: '#000000',
    stadium: 'Estádio do Mengalvio',
    capacity: 78000,
    reputation: 95,
    budget: 80_000_000,
    wageBudget: 4_000_000,
  },
  {
    id: 'palestra',
    name: 'SE Palestra',
    shortName: 'PAL',
    realInspiration: 'Palmeiras',
    primaryColor: '#006437',
    secondaryColor: '#FFFFFF',
    stadium: 'Arena Palestra',
    capacity: 43000,
    reputation: 93,
    budget: 75_000_000,
    wageBudget: 3_800_000,
  },
  {
    id: 'timao',
    name: 'Timão Paulista',
    shortName: 'TIM',
    realInspiration: 'Corinthians',
    primaryColor: '#000000',
    secondaryColor: '#FFFFFF',
    stadium: 'Arena do Timão',
    capacity: 49000,
    reputation: 90,
    budget: 60_000_000,
    wageBudget: 3_500_000,
  },
  {
    id: 'trikas',
    name: 'Trikas FC',
    shortName: 'TRI',
    realInspiration: 'São Paulo',
    primaryColor: '#FF0000',
    secondaryColor: '#FFFFFF',
    stadium: 'Estádio Trikas',
    capacity: 66000,
    reputation: 88,
    budget: 55_000_000,
    wageBudget: 3_200_000,
  },
  {
    id: 'acmineiro',
    name: 'AC Mineiro',
    shortName: 'ACM',
    realInspiration: 'Atlético-MG',
    primaryColor: '#000000',
    secondaryColor: '#FFFFFF',
    stadium: 'Arena do Galo',
    capacity: 61000,
    reputation: 86,
    budget: 50_000_000,
    wageBudget: 3_000_000,
  },

  // Tier 2 - Strong clubs (reputation 75-84)
  {
    id: 'putfire',
    name: 'Putfire',
    shortName: 'PUT',
    realInspiration: 'Botafogo',
    primaryColor: '#000000',
    secondaryColor: '#FFFFFF',
    stadium: 'Estádio Nilton Santos',
    capacity: 46000,
    reputation: 84,
    budget: 45_000_000,
    wageBudget: 2_800_000,
  },
  {
    id: 'flordelince',
    name: 'Flor de Lince',
    shortName: 'FDL',
    realInspiration: 'Fluminense',
    primaryColor: '#7B1C3A',
    secondaryColor: '#006633',
    stadium: 'Estádio das Laranjeiras',
    capacity: 59000,
    reputation: 82,
    budget: 40_000_000,
    wageBudget: 2_500_000,
  },
  {
    id: 'colorado',
    name: 'CR Colorado',
    shortName: 'COL',
    realInspiration: 'Internacional',
    primaryColor: '#E30613',
    secondaryColor: '#FFFFFF',
    stadium: 'Estádio Beira-Rio',
    capacity: 50000,
    reputation: 80,
    budget: 38_000_000,
    wageBudget: 2_400_000,
  },
  {
    id: 'gpa',
    name: 'Grupo Porto-Alegrense',
    shortName: 'GPA',
    realInspiration: 'Grêmio',
    primaryColor: '#0080C8',
    secondaryColor: '#000000',
    stadium: 'Arena do Grêmio',
    capacity: 55000,
    reputation: 79,
    budget: 36_000_000,
    wageBudget: 2_300_000,
  },
  {
    id: 'cabuloso',
    name: 'Cabuloso Estrelado',
    shortName: 'CAB',
    realInspiration: 'Cruzeiro',
    primaryColor: '#003DA5',
    secondaryColor: '#FFFFFF',
    stadium: 'Mineirão',
    capacity: 62000,
    reputation: 78,
    budget: 35_000_000,
    wageBudget: 2_200_000,
  },
  {
    id: 'tdcolina',
    name: 'Time da Colina CR',
    shortName: 'TDC',
    realInspiration: 'Vasco',
    primaryColor: '#000000',
    secondaryColor: '#FFFFFF',
    stadium: 'São Januário',
    capacity: 21000,
    reputation: 76,
    budget: 30_000_000,
    wageBudget: 2_000_000,
  },
  {
    id: 'baleia',
    name: 'CR Baleia',
    shortName: 'BAL',
    realInspiration: 'Santos',
    primaryColor: '#FFFFFF',
    secondaryColor: '#000000',
    stadium: 'Vila Belmiro',
    capacity: 16000,
    reputation: 75,
    budget: 28_000_000,
    wageBudget: 1_800_000,
  },

  // Tier 3 - Mid-table clubs (reputation 65-74)
  {
    id: 'esquadrao',
    name: 'Esquadrão DA',
    shortName: 'ESQ',
    realInspiration: 'Bahia',
    primaryColor: '#004A98',
    secondaryColor: '#E30613',
    stadium: 'Arena Fonte Nova',
    capacity: 50000,
    reputation: 72,
    budget: 25_000_000,
    wageBudget: 1_600_000,
  },
  {
    id: 'paranaense',
    name: 'Paranaense',
    shortName: 'PAR',
    realInspiration: 'Athletico-PR',
    primaryColor: '#B8002A',
    secondaryColor: '#000000',
    stadium: 'Arena da Baixada',
    capacity: 42000,
    reputation: 70,
    budget: 22_000_000,
    wageBudget: 1_500_000,
  },
  {
    id: 'massabruta',
    name: 'Massa Bruta SC',
    shortName: 'MAS',
    realInspiration: 'RB Bragantino',
    primaryColor: '#FFFFFF',
    secondaryColor: '#B8002A',
    stadium: 'Estádio Nabi Abi Chedid',
    capacity: 18000,
    reputation: 68,
    budget: 30_000_000,
    wageBudget: 1_800_000,
  },
  {
    id: 'leaodabarra',
    name: 'Leão da Barra',
    shortName: 'LDB',
    realInspiration: 'Vitória',
    primaryColor: '#E30613',
    secondaryColor: '#000000',
    stadium: 'Barradão',
    capacity: 35000,
    reputation: 66,
    budget: 18_000_000,
    wageBudget: 1_200_000,
  },

  // Tier 4 - Smaller clubs (reputation 55-64)
  {
    id: 'coxaverde',
    name: 'Coxa-Verde EC',
    shortName: 'COX',
    realInspiration: 'Coritiba',
    primaryColor: '#006633',
    secondaryColor: '#FFFFFF',
    stadium: 'Couto Pereira',
    capacity: 40000,
    reputation: 62,
    budget: 15_000_000,
    wageBudget: 1_000_000,
  },
  {
    id: 'chapaquente',
    name: 'SC Chapa Quente',
    shortName: 'CHA',
    realInspiration: 'Chapecoense',
    primaryColor: '#006633',
    secondaryColor: '#FFFFFF',
    stadium: 'Arena Condá',
    capacity: 22000,
    reputation: 58,
    budget: 12_000_000,
    wageBudget: 800_000,
  },
  {
    id: 'leaoazul',
    name: 'Leão Azul',
    shortName: 'LEA',
    realInspiration: 'Remo',
    primaryColor: '#003DA5',
    secondaryColor: '#FFFFFF',
    stadium: 'Mangueirão',
    capacity: 48000,
    reputation: 56,
    budget: 10_000_000,
    wageBudget: 700_000,
  },
  {
    id: 'laranjamecanica',
    name: 'AS Laranja Mecânica',
    shortName: 'LAR',
    realInspiration: 'Mirassol',
    primaryColor: '#FF6600',
    secondaryColor: '#000000',
    stadium: 'Estádio Maião',
    capacity: 15000,
    reputation: 55,
    budget: 8_000_000,
    wageBudget: 600_000,
  },
];

/**
 * Get a team by its ID
 */
export function getTeamById(id: string): TeamSeed | undefined {
  return TEAMS.find((t) => t.id === id);
}

/**
 * Get team by real inspiration name (for mapping during player generation)
 */
export function getTeamByRealName(realName: string): TeamSeed | undefined {
  const normalized = realName.toLowerCase().trim();
  return TEAMS.find((t) =>
    t.realInspiration.toLowerCase().includes(normalized),
  );
}

/**
 * Map a real team name to our fictional team ID
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
  athletico: 'paranaense',
  'rb bragantino': 'massabruta',
  bragantino: 'massabruta',
  vitória: 'leaodabarra',
  vitoria: 'leaodabarra',
  coritiba: 'coxaverde',
  chapecoense: 'chapaquente',
  remo: 'leaoazul',
  mirassol: 'laranjamecanica',
};
