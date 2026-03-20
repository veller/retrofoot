import {
  MatchResultInputSchema,
  CompleteRoundRequestSchema,
  RoundLockPayloadSchema,
} from '../types/match.types';

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
assert(
  parsedNewShape.success,
  'Schema should accept side-specific payload fields',
);

const parsedLegacy = MatchResultInputSchema.safeParse({
  ...basePayload,
  lineupPlayerIds: ['p1', 'p2'],
  substitutionMinutes: { p1: 60, p12: 60 },
});
assert(
  parsedLegacy.success,
  'Schema should preserve legacy payload compatibility',
);

const parsedLockPayload = RoundLockPayloadSchema.safeParse({
  saveId: 'save-1',
  round: 3,
  createdAt: new Date().toISOString(),
  fixtures: [
    {
      ...basePayload,
      lineupByTeam: {
        home: ['h1', 'h2'],
        away: ['a1', 'a2'],
      },
      substitutionMinutesByTeam: {
        home: { h1: 70 },
        away: { a1: 80 },
      },
      lockedAt: new Date().toISOString(),
    },
  ],
});
assert(parsedLockPayload.success, 'Schema should accept round lock payload');

const parsedCompleteNoResults = CompleteRoundRequestSchema.safeParse({});
assert(
  parsedCompleteNoResults.success,
  'Schema should allow completion request without client result payload',
);
