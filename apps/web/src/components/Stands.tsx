import type { CSSProperties } from 'react';

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
}: StandsProps) {
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
              {row.map((seat, seatIndex) => (
                <div
                  key={`${rowIndex}-${seatIndex}`}
                  className="relative shrink-0"
                  style={{
                    width: `${PERSON_WIDTH}px`,
                    height: `${PERSON_HEIGHT}px`,
                    ...getSeatStyle(seat, colorSet),
                    imageRendering: 'pixelated',
                  }}
                />
              ))}
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
