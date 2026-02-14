import { create } from 'zustand';
import type {
  AiTraceEvent,
  AiTraceEventType,
  AiTraceSeverity,
  AiTraceTeam,
} from '@retrofoot/core';

export interface AiTraceFilters {
  team: AiTraceTeam | 'all';
  type: AiTraceEventType | 'all';
  severity: AiTraceSeverity | 'all';
  minuteMin: number | null;
  minuteMax: number | null;
  search: string;
}

interface AiTraceState {
  events: AiTraceEvent[];
  paused: boolean;
  maxEvents: number;
  selectedEventId: string | null;
  filters: AiTraceFilters;
  push: (event: AiTraceEvent) => void;
  clear: () => void;
  togglePause: () => void;
  setFilters: (filters: Partial<AiTraceFilters>) => void;
  setSelectedEventId: (eventId: string | null) => void;
}

const DEFAULT_FILTERS: AiTraceFilters = {
  team: 'all',
  type: 'all',
  severity: 'all',
  minuteMin: null,
  minuteMax: null,
  search: '',
};

const DEFAULT_MAX_EVENTS = 1000;

export const useAiTraceStore = create<AiTraceState>((set, get) => ({
  events: [],
  paused: false,
  maxEvents: DEFAULT_MAX_EVENTS,
  selectedEventId: null,
  filters: DEFAULT_FILTERS,
  push: (event) => {
    const { paused, maxEvents } = get();
    if (paused) return;
    set((state) => {
      const next = [...state.events, event];
      const trimmed =
        next.length > maxEvents ? next.slice(next.length - maxEvents) : next;
      return {
        events: trimmed,
        selectedEventId:
          state.selectedEventId && trimmed.some((e) => e.id === state.selectedEventId)
            ? state.selectedEventId
            : trimmed[trimmed.length - 1]?.id ?? null,
      };
    });
  },
  clear: () =>
    set({
      events: [],
      selectedEventId: null,
      filters: DEFAULT_FILTERS,
      paused: false,
    }),
  togglePause: () => set((state) => ({ paused: !state.paused })),
  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),
  setSelectedEventId: (eventId) => set({ selectedEventId: eventId }),
}));

function includesSearch(event: AiTraceEvent, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  if (event.label.toLowerCase().includes(q)) return true;
  if (event.summary.toLowerCase().includes(q)) return true;
  if (event.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
  const sections = [event.inputs, event.computed, event.outcome];
  for (const section of sections) {
    for (const [key, value] of Object.entries(section)) {
      if (key.toLowerCase().includes(q)) return true;
      if (String(value).toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

export function selectFilteredTraceEvents(state: AiTraceState): AiTraceEvent[] {
  const { team, type, severity, minuteMin, minuteMax, search } = state.filters;
  return state.events.filter((event) => {
    if (team !== 'all' && event.team !== team) return false;
    if (type !== 'all' && event.type !== type) return false;
    if (severity !== 'all' && event.severity !== severity) return false;
    if (minuteMin !== null && event.minute < minuteMin) return false;
    if (minuteMax !== null && event.minute > minuteMax) return false;
    return includesSearch(event, search);
  });
}

export function selectCurrentTraceMinute(state: AiTraceState): number {
  return state.events[state.events.length - 1]?.minute ?? 0;
}

export function selectTraceTypeCounts(
  state: AiTraceState,
): Record<AiTraceEventType, number> {
  const counts: Record<AiTraceEventType, number> = {
    minute_context: 0,
    event_probability: 0,
    chance_evaluation: 0,
    sub_candidate: 0,
    sub_executed: 0,
    energy_tick: 0,
    posture_adjustment: 0,
  };
  for (const event of state.events) {
    counts[event.type] += 1;
  }
  return counts;
}

export function selectTraceTeamCounts(
  state: AiTraceState,
): Record<'home' | 'away' | 'neutral' | 'unknown', number> {
  const counts = { home: 0, away: 0, neutral: 0, unknown: 0 };
  for (const event of state.events) {
    const key = event.team ?? 'unknown';
    counts[key] += 1;
  }
  return counts;
}

export function selectTraceSeverityCounts(
  state: AiTraceState,
): Record<AiTraceSeverity, number> {
  const counts: Record<AiTraceSeverity, number> = {
    info: 0,
    warning: 0,
    critical: 0,
  };
  for (const event of state.events) {
    counts[event.severity] += 1;
  }
  return counts;
}
