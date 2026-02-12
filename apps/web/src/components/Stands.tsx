import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Player } from '@retrofoot/core';

type SeatKind = 'empty' | 'home' | 'away';

const PERSON_BASE_WIDTH = 32;
const PERSON_BASE_HEIGHT = 40;
const PERSON_SCALE = 0.75;
const PERSON_WIDTH = Math.round(PERSON_BASE_WIDTH * PERSON_SCALE);
const PERSON_HEIGHT = Math.round(PERSON_BASE_HEIGHT * PERSON_SCALE);
const SEAT_GAP_PX = 2;
const ROW_PAD_X_PX = 2;

function px(value: number): string {
  return `${Math.round(value * PERSON_SCALE)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(hex: string): string {
  const clean = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean;
  if (/^#[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return '#ffffff';
}

function darkenHex(hex: string, amount: number): string {
  const normalized = normalizeHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);

  const factor = 1 - clamp(amount, 0, 1);
  const dr = Math.round(r * factor);
  const dg = Math.round(g * factor);
  const db = Math.round(b * factor);

  const toHex = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${toHex(dr)}${toHex(dg)}${toHex(db)}`;
}

interface StandsProps {
  className?: string;
  capacity: number;
  expectedAttendance: number;
  expectedAttendanceText: string;
  stadiumName: string;
  homePrimaryColor: string;
  awayPrimaryColor: string;
  homeFanRatio?: number;
  awayFanRatio?: number;
  rows?: number;
  cols?: number;
  homeLastFiveResults?: ('W' | 'D' | 'L')[];
  homeFormation?: string;
  homeLineup?: Player[];
}

interface BubbleMessage {
  id: string;
  seatKey: string;
  text: string;
}

const BUBBLE_DURATION_MS = 4200;
const BUBBLE_MIN_DELAY_MS = 1800;
const BUBBLE_MAX_DELAY_MS = 4600;
const AWAY_BUBBLE_INTERVAL_MS = 10000;
const MAX_ACTIVE_BUBBLES = 2;

function toFirstName(input: string): string {
  const normalized = input.trim();
  if (!normalized) return 'the striker';
  return normalized.split(/\s+/)[0] || 'the striker';
}

function resolveStrikerFirstName(lineup: Player[]): string {
  const attacker = lineup.find((player) => player.position === 'ATT');
  if (attacker?.nickname?.trim()) return toFirstName(attacker.nickname);
  if (attacker?.name?.trim()) return toFirstName(attacker.name);

  const fallback = lineup[0];
  if (fallback?.nickname?.trim()) return toFirstName(fallback.nickname);
  if (fallback?.name?.trim()) return toFirstName(fallback.name);

  return 'the striker';
}

function resolveDefenderFirstName(lineup: Player[]): string {
  const defender = lineup.find((player) => player.position === 'DEF');
  if (defender?.nickname?.trim()) return toFirstName(defender.nickname);
  if (defender?.name?.trim()) return toFirstName(defender.name);

  const fallback = lineup[0];
  if (fallback?.nickname?.trim()) return toFirstName(fallback.nickname);
  if (fallback?.name?.trim()) return toFirstName(fallback.name);

  return 'our center-back';
}

function countTailStreak(
  results: ('W' | 'D' | 'L')[],
  target: 'W' | 'L',
): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] !== target) break;
    streak++;
  }
  return streak;
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function randomDelayMs(): number {
  return (
    BUBBLE_MIN_DELAY_MS +
    randomInt(BUBBLE_MAX_DELAY_MS - BUBBLE_MIN_DELAY_MS + 1)
  );
}

function fillTemplate(
  template: string,
  tokens: { strikerFirstName: string; defenderFirstName: string; formation: string },
): string {
  return template
    .replace(/\{strikerFirstName\}/g, tokens.strikerFirstName)
    .replace(/\{defenderFirstName\}/g, tokens.defenderFirstName)
    .replace(/\{formation\}/g, tokens.formation);
}

function pickCommentWithoutImmediateRepeat(
  pool: string[],
  latestComment: string | null,
): string {
  if (pool.length <= 1) return pool[0] || '';
  const candidates = latestComment
    ? pool.filter((entry) => entry !== latestComment)
    : pool;
  if (candidates.length === 0) return pool[randomInt(pool.length)];
  return candidates[randomInt(candidates.length)];
}

interface GenerateSeatGridParams {
  capacity: number;
  expectedAttendance: number;
  homeFanRatio: number;
  awayFanRatio: number;
  rows: number;
  cols: number;
}

function generateSeatGrid({
  capacity,
  expectedAttendance,
  homeFanRatio,
  awayFanRatio,
  rows,
  cols,
}: GenerateSeatGridParams): SeatKind[][] {
  const totalSeats = rows * cols;
  if (totalSeats <= 0) return [];

  const safeCapacity = Math.max(0, capacity);
  const safeAttendance = Math.max(0, expectedAttendance);
  const occupancy =
    safeCapacity > 0 ? clamp(safeAttendance / safeCapacity, 0, 1) : 0;
  let occupiedSeats = Math.round(totalSeats * occupancy);

  const ratioTotal = homeFanRatio + awayFanRatio;
  const homeRatio = ratioTotal > 0 ? homeFanRatio / ratioTotal : 0.9;

  // Reserve one dedicated empty separator column between home and away fans
  // whenever both groups are present and we have enough width.
  const canHaveSeparator = cols >= 3;
  if (canHaveSeparator) {
    const maxWithSeparator = rows * (cols - 1);
    occupiedSeats = Math.min(occupiedSeats, maxWithSeparator);
  }

  const homeSeats = Math.round(occupiedSeats * homeRatio);
  const awaySeats = occupiedSeats - homeSeats;
  const hasBothGroups = homeSeats > 0 && awaySeats > 0;

  if (!canHaveSeparator || !hasBothGroups) {
    const flatSeats: SeatKind[] = Array(totalSeats).fill('empty');
    for (let i = 0; i < homeSeats; i++) flatSeats[i] = 'home';
    for (let i = homeSeats; i < homeSeats + awaySeats; i++)
      flatSeats[i] = 'away';

    const seatRows: SeatKind[][] = [];
    for (let row = 0; row < rows; row++) {
      const start = row * cols;
      seatRows.push(flatSeats.slice(start, start + cols));
    }
    return seatRows;
  }

  const homeNeedPerRow = Math.ceil(homeSeats / rows);
  const awayNeedPerRow = Math.ceil(awaySeats / rows);
  const preferredSeparatorIndex = Math.round((cols - 1) * homeRatio);
  const minSeparatorIndex = Math.max(1, homeNeedPerRow);
  const maxSeparatorIndex = Math.min(cols - 2, cols - 1 - awayNeedPerRow);
  const separatorIndex = clamp(
    preferredSeparatorIndex,
    minSeparatorIndex,
    maxSeparatorIndex,
  );

  const homeCapacityPerRow = separatorIndex;
  const awayCapacityPerRow = cols - separatorIndex - 1;

  const seatRows: SeatKind[][] = [];
  const baseHomePerRow = Math.floor(homeSeats / rows);
  const baseAwayPerRow = Math.floor(awaySeats / rows);
  let homeRemainder = homeSeats % rows;
  let awayRemainder = awaySeats % rows;

  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    const requestedHome = baseHomePerRow + (homeRemainder > 0 ? 1 : 0);
    const requestedAway = baseAwayPerRow + (awayRemainder > 0 ? 1 : 0);
    if (homeRemainder > 0) homeRemainder--;
    if (awayRemainder > 0) awayRemainder--;

    const rowHome = Math.min(requestedHome, homeCapacityPerRow);
    const rowAway = Math.min(requestedAway, awayCapacityPerRow);
    const rowSeats: SeatKind[] = Array(cols).fill('empty');

    for (let i = 0; i < rowHome; i++) {
      rowSeats[i] = 'home';
    }
    // Keep exactly one empty separator column.
    rowSeats[separatorIndex] = 'empty';
    for (let i = 0; i < rowAway; i++) {
      rowSeats[cols - 1 - i] = 'away';
    }

    seatRows.push(rowSeats);
  }

  return seatRows;
}

function getSeatStyle(
  kind: SeatKind,
  colors: {
    homeShirt: string;
    homeShirtDark: string;
    awayShirt: string;
    awayShirtDark: string;
  },
): CSSProperties {
  if (kind === 'empty') {
    return {
      background: '#1a1a2e',
      border: '1px solid #333',
    };
  }

  const shirt = kind === 'home' ? colors.homeShirt : colors.awayShirt;
  const shirtDark =
    kind === 'home' ? colors.homeShirtDark : colors.awayShirtDark;
  const eye = '#ffd700';

  return {
    backgroundImage: [
      `linear-gradient(to right, transparent ${px(10)}, ${eye} ${px(10)}, ${eye} ${px(12)}, transparent ${px(12)}, transparent ${px(20)}, ${eye} ${px(20)}, ${eye} ${px(22)}, transparent ${px(22)})`,
      `linear-gradient(to right, transparent ${px(8)}, ${eye} ${px(8)}, ${eye} ${px(24)}, transparent ${px(24)})`,
      `linear-gradient(to right, transparent ${px(6)}, #d4a574 ${px(6)}, #d4a574 ${px(26)}, transparent ${px(26)})`,
      `linear-gradient(to right, transparent ${px(10)}, #d4a574 ${px(10)}, #d4a574 ${px(22)}, transparent ${px(22)})`,
      `linear-gradient(to right, transparent ${px(8)}, ${shirt} ${px(8)}, ${shirt} ${px(24)}, transparent ${px(24)})`,
      `linear-gradient(to right, transparent ${px(4)}, ${shirt} ${px(4)}, ${shirt} ${px(28)}, transparent ${px(28)})`,
      `linear-gradient(to right, transparent ${px(6)}, ${shirtDark} ${px(6)}, ${shirtDark} ${px(26)}, transparent ${px(26)})`,
    ].join(','),
    backgroundSize: `${px(32)} ${px(2)}, ${px(32)} ${px(4)}, ${px(32)} ${px(6)}, ${px(32)} ${px(4)}, ${px(32)} ${px(8)}, ${px(32)} ${px(10)}, ${px(32)} ${px(6)}`,
    backgroundPosition: `0 0, 0 ${px(2)}, 0 ${px(6)}, 0 ${px(12)}, 0 ${px(16)}, 0 ${px(24)}, 0 ${px(34)}`,
    backgroundRepeat: 'no-repeat',
  };
}

export function Stands({
  className = '',
  capacity,
  expectedAttendance,
  expectedAttendanceText,
  stadiumName,
  homePrimaryColor,
  awayPrimaryColor,
  homeFanRatio = 0.9,
  awayFanRatio = 0.1,
  rows = 3,
  cols = 20,
  homeLastFiveResults = [],
  homeFormation = '4-3-3',
  homeLineup = [],
}: StandsProps) {
  const [activeBubbles, setActiveBubbles] = useState<BubbleMessage[]>([]);
  const latestHomeCommentRef = useRef<string | null>(null);
  const latestAwayCommentRef = useRef<string | null>(null);
  const seatRows = generateSeatGrid({
    capacity,
    expectedAttendance,
    homeFanRatio,
    awayFanRatio,
    rows,
    cols,
  });
  const homeShirt = normalizeHex(homePrimaryColor);
  const awayShirt = normalizeHex(awayPrimaryColor);
  const colorSet = {
    homeShirt,
    homeShirtDark: darkenHex(homeShirt, 0.35),
    awayShirt,
    awayShirtDark: darkenHex(awayShirt, 0.35),
  };
  const homeSeatKeys = useMemo(() => {
    const keys: string[] = [];
    for (let rowIndex = 0; rowIndex < seatRows.length; rowIndex++) {
      const row = seatRows[rowIndex];
      for (let seatIndex = 0; seatIndex < row.length; seatIndex++) {
        if (row[seatIndex] === 'home') keys.push(`${rowIndex}-${seatIndex}`);
      }
    }
    return keys;
  }, [seatRows]);
  const awaySeatKeys = useMemo(() => {
    const keys: string[] = [];
    for (let rowIndex = 0; rowIndex < seatRows.length; rowIndex++) {
      const row = seatRows[rowIndex];
      for (let seatIndex = 0; seatIndex < row.length; seatIndex++) {
        if (row[seatIndex] === 'away') keys.push(`${rowIndex}-${seatIndex}`);
      }
    }
    return keys;
  }, [seatRows]);
  const strikerFirstName = useMemo(
    () => resolveStrikerFirstName(homeLineup),
    [homeLineup],
  );
  const defenderFirstName = useMemo(
    () => resolveDefenderFirstName(homeLineup),
    [homeLineup],
  );
  const winStreak = useMemo(
    () => countTailStreak(homeLastFiveResults, 'W'),
    [homeLastFiveResults],
  );
  const lossStreak = useMemo(
    () => countTailStreak(homeLastFiveResults, 'L'),
    [homeLastFiveResults],
  );

  const commentPool = useMemo(() => {
    const winningComments = [
      'i hope {strikerFirstName} scores today',
      'i love when they play {formation}',
      'one more win and we fly',
      'our attack is cooking lately',
      'this squad is full confidence',
      'keep pressing, keep scoring',
      '{strikerFirstName} is on fire today',
      '{formation} is pure football art',
      'this team is playing with swagger',
      'we are about to put on a show',
      'the crowd can smell another win',
      'if we strike first this is over',
      'best grilled corn in the league',
      'hot dogs taste better on win streaks',
    ];

    const losingComments = [
      'i cant believe they insist on {formation}',
      'this defense is the worst',
      'another bad start and i go silent',
      'we need changes in midfield',
      'please stop giving the ball away',
      'why are we so open at the back',
      '{formation} again? really?',
      'we need heart today, not excuses',
      'my nerves cant take another collapse',
      'somebody please mark their striker',
      'we need to fight for every ball',
      'this back line is giving me gray hair',
      'the chips are cold and so is our form',
      'even the stadium burger gave up on us',
      "if {defenderFirstName} scores another own goal i'm divorcing my wife",
    ];

    const neutralComments = [
      'come on lads, wake up',
      'big game, big noise',
      'i just want a clean sheet',
      'first tackle sets the tone',
      'stadium is buzzing tonight',
      'one early goal changes everything',
      'lets see who steps up',
      'ninety minutes, no fear',
      'play simple and move the ball',
      'this is where heroes are made',
      'every duel matters today',
      'give us effort and we sing all night',
      'the popcorn is elite tonight',
      'food is good, now give us goals',
    ];

    const tokens = {
      strikerFirstName,
      defenderFirstName,
      formation: homeFormation || '4-3-3',
    };

    if (winStreak >= 1) {
      return winningComments.map((entry) => fillTemplate(entry, tokens));
    }
    if (lossStreak >= 1) {
      return losingComments.map((entry) => fillTemplate(entry, tokens));
    }
    return neutralComments.map((entry) => fillTemplate(entry, tokens));
  }, [defenderFirstName, homeFormation, lossStreak, strikerFirstName, winStreak]);
  const awayCommentPool = useMemo(
    () => [
      '10h driving to see them',
      'away end still louder than theirs',
      'long trip, no regrets',
      'we came far, sing harder',
      'fuel, tolls, and full voice',
      'rain or sun, we travel',
    ],
    [],
  );

  useEffect(() => {
    setActiveBubbles([]);
    latestHomeCommentRef.current = null;
    latestAwayCommentRef.current = null;
  }, [homeFormation, homeLastFiveResults, strikerFirstName, homeSeatKeys.length]);

  useEffect(() => {
    if (homeSeatKeys.length === 0 || commentPool.length === 0) return;

    let mounted = true;
    const timeoutHandles = new Set<number>();

    const scheduleNext = () => {
      if (!mounted) return;
      const spawnHandle = window.setTimeout(() => {
        if (!mounted) return;
        const seatChoice = homeSeatKeys[randomInt(homeSeatKeys.length)];
        const textChoice = pickCommentWithoutImmediateRepeat(
          commentPool,
          latestHomeCommentRef.current,
        );
        latestHomeCommentRef.current = textChoice;

        setActiveBubbles((current) => {
          const nextId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const next: BubbleMessage = {
            id: nextId,
            seatKey: seatChoice,
            text: textChoice,
          };

          const withoutSameSeat = current.filter(
            (bubble) => bubble.seatKey !== seatChoice,
          );
          const nextMessages = [...withoutSameSeat.slice(-(MAX_ACTIVE_BUBBLES - 1)), next];

          const cleanupHandle = window.setTimeout(() => {
            setActiveBubbles((live) => live.filter((bubble) => bubble.id !== nextId));
            timeoutHandles.delete(cleanupHandle);
          }, BUBBLE_DURATION_MS);
          timeoutHandles.add(cleanupHandle);

          return nextMessages;
        });

        timeoutHandles.delete(spawnHandle);
        scheduleNext();
      }, randomDelayMs());

      timeoutHandles.add(spawnHandle);
    };

    scheduleNext();

    return () => {
      mounted = false;
      timeoutHandles.forEach((handle) => window.clearTimeout(handle));
      timeoutHandles.clear();
    };
  }, [commentPool, homeSeatKeys]);

  useEffect(() => {
    if (awaySeatKeys.length === 0 || awayCommentPool.length === 0) return;

    let mounted = true;
    const timeoutHandles = new Set<number>();

    const intervalHandle = window.setInterval(() => {
      if (!mounted) return;
      const seatChoice = awaySeatKeys[randomInt(awaySeatKeys.length)];
      const textChoice = pickCommentWithoutImmediateRepeat(
        awayCommentPool,
        latestAwayCommentRef.current,
      );
      latestAwayCommentRef.current = textChoice;

      setActiveBubbles((current) => {
        const nextId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const next: BubbleMessage = {
          id: nextId,
          seatKey: seatChoice,
          text: textChoice,
        };
        const withoutSameSeat = current.filter(
          (bubble) => bubble.seatKey !== seatChoice,
        );
        const nextMessages = [...withoutSameSeat.slice(-(MAX_ACTIVE_BUBBLES - 1)), next];

        const cleanupHandle = window.setTimeout(() => {
          setActiveBubbles((live) => live.filter((bubble) => bubble.id !== nextId));
          timeoutHandles.delete(cleanupHandle);
        }, BUBBLE_DURATION_MS);
        timeoutHandles.add(cleanupHandle);

        return nextMessages;
      });
    }, AWAY_BUBBLE_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(intervalHandle);
      timeoutHandles.forEach((handle) => window.clearTimeout(handle));
      timeoutHandles.clear();
    };
  }, [awayCommentPool, awaySeatKeys]);

  const standContentWidth =
    cols * PERSON_WIDTH +
    Math.max(0, cols - 1) * SEAT_GAP_PX +
    ROW_PAD_X_PX * 2;

  return (
    <div
      id="immersive-stands"
      className={`pointer-events-none mx-auto w-fit flex flex-col ${className}`}
      style={{ width: `${standContentWidth}px` }}
      aria-hidden
    >
      <div className="rounded p-1 shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
        <div className="flex w-fit flex-col-reverse gap-0">
          {seatRows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="flex w-fit items-center gap-[2px] bg-[#2a2a3e] px-[2px] py-[1px]"
            >
              {row.map((seat, seatIndex) => {
                const seatKey = `${rowIndex}-${seatIndex}`;
                const bubble = activeBubbles.find(
                  (entry) => entry.seatKey === seatKey,
                );

                return (
                  <div
                    key={seatKey}
                    className="relative shrink-0"
                    style={{
                      width: `${PERSON_WIDTH}px`,
                      height: `${PERSON_HEIGHT}px`,
                      ...getSeatStyle(seat, colorSet),
                      imageRendering: 'pixelated',
                    }}
                  >
                    {(seat === 'home' || seat === 'away') && bubble?.text && (
                      <div className="immersive-stand-bubble" role="presentation">
                        <span className="immersive-stand-bubble__text">
                          {bubble.text}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-1 text-center text-[10px] text-slate-300">
        {stadiumName} · Expected Attendance: {expectedAttendanceText}
      </p>
    </div>
  );
}
