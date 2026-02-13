import { MatchResultInputSchema } from '../types/match.types';

const basePayload = {
  fixtureId: 'fx-1',
  homeScore: 2,
  awayScore: 1,
  attendance: 12345,
  events: [],
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const parsedNewShape = MatchResultInputSchema.safeParse({
  ...basePayload,
  lineupByTeam: {
    home: ['h1', 'h2'],
    away: ['a1', 'a2'],
  },
  substitutionMinutesByTeam: {
    home: { h1: 60, h12: 60 },
    away: { a1: 75, a12: 75 },
  },
});
assert(parsedNewShape.success, 'Schema should accept side-specific payload fields');

const parsedLegacy = MatchResultInputSchema.safeParse({
  ...basePayload,
  lineupPlayerIds: ['p1', 'p2'],
  substitutionMinutes: { p1: 60, p12: 60 },
});
assert(parsedLegacy.success, 'Schema should preserve legacy payload compatibility');
