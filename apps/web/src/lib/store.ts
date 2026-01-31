import { create } from 'zustand'

interface GameState {
  // Current save state
  saveId: string | null
  currentSeason: string | null
  currentRound: number
  playerTeamId: string | null

  // Loading state
  isLoading: boolean
  error: string | null

  // Actions
  loadSave: (saveId: string) => void
  clearSave: () => void
  setCurrentRound: (round: number) => void
  setSeason: (season: string) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
}

export const useGameStore = create<GameState>((set) => ({
  // Initial state
  saveId: null,
  currentSeason: null,
  currentRound: 1,
  playerTeamId: null,
  isLoading: false,
  error: null,

  // Actions
  loadSave: (saveId: string) =>
    set({
      saveId,
      isLoading: true,
      error: null,
    }),

  clearSave: () =>
    set({
      saveId: null,
      currentSeason: null,
      currentRound: 1,
      playerTeamId: null,
      error: null,
    }),

  setCurrentRound: (round: number) => set({ currentRound: round }),

  setSeason: (season: string) => set({ currentSeason: season }),

  setLoading: (isLoading: boolean) => set({ isLoading }),

  setError: (error: string | null) => set({ error, isLoading: false }),
}))
