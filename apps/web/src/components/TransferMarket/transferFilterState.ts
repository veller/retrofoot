import type { Position } from '@retrofoot/core';

export interface FilterState {
  position: Position | 'ALL';
  minOverall: number;
  maxOverall: number;
  maxPrice: number;
  maxAge: number;
}

export const DEFAULT_FILTERS: FilterState = {
  position: 'ALL',
  minOverall: 1,
  maxOverall: 99,
  maxPrice: 0,
  maxAge: 99,
};
