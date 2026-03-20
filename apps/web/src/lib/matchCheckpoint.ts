import type { LiveMatchState } from '@retrofoot/core';

const KEY_PREFIX = 'retrofoot/matchCheckpoint';

export function matchCheckpointKey(saveId: string, round: number): string {
  return `${KEY_PREFIX}/${saveId}/${round}`;
}

export interface StoredMatchCheckpoint {
  v: 1;
  matches: LiveMatchState[];
  playerMatchIndex: number;
  currentMinute: number;
  currentSeconds: number;
  isPaused: boolean;
}

function stripMatchesForStorage(
  matches: LiveMatchState[],
): Omit<LiveMatchState, 'trace'>[] {
  return matches.map((m) => {
    const copy = { ...m };
    delete copy.trace;
    return copy as Omit<LiveMatchState, 'trace'>;
  });
}

export function saveMatchCheckpoint(
  saveId: string,
  round: number,
  payload: Omit<StoredMatchCheckpoint, 'v'> & { matches: LiveMatchState[] },
): void {
  try {
    const data: StoredMatchCheckpoint = {
      v: 1,
      matches: stripMatchesForStorage(payload.matches) as LiveMatchState[],
      playerMatchIndex: payload.playerMatchIndex,
      currentMinute: payload.currentMinute,
      currentSeconds: payload.currentSeconds,
      isPaused: payload.isPaused,
    };
    localStorage.setItem(
      matchCheckpointKey(saveId, round),
      JSON.stringify(data),
    );
  } catch {
    // Quota / private mode
  }
}

export function loadMatchCheckpoint(
  saveId: string,
  round: number,
): StoredMatchCheckpoint | null {
  try {
    const raw = localStorage.getItem(matchCheckpointKey(saveId, round));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMatchCheckpoint;
    if (parsed.v !== 1 || !Array.isArray(parsed.matches)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearMatchCheckpoint(saveId: string, round: number): void {
  try {
    localStorage.removeItem(matchCheckpointKey(saveId, round));
  } catch {
    // ignore
  }
}
