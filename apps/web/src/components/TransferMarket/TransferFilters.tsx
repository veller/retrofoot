import type { Position } from '@retrofoot/core';
import type { FilterState } from './transferFilterState';

interface TransferFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

const POSITION_OPTIONS: { value: Position | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Positions' },
  { value: 'GK', label: 'Goalkeeper' },
  { value: 'DEF', label: 'Defender' },
  { value: 'MID', label: 'Midfielder' },
  { value: 'ATT', label: 'Attacker' },
];

export function TransferFilters({ filters, onChange }: TransferFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Position Filter */}
      <select
        value={filters.position}
        onChange={(e) =>
          onChange({ ...filters, position: e.target.value as Position | 'ALL' })
        }
        className="select-chevron bg-slate-700 text-white text-sm px-3 py-2 rounded border border-slate-600"
      >
        {POSITION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Overall Range */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">OVR:</span>
        <input
          type="number"
          min={1}
          max={99}
          value={filters.minOverall}
          onChange={(e) => {
            const newMin = parseInt(e.target.value) || 1;
            // Ensure minOverall <= maxOverall
            onChange({
              ...filters,
              minOverall: newMin,
              maxOverall: Math.max(newMin, filters.maxOverall),
            });
          }}
          className="w-14 bg-slate-700 text-white text-sm px-2 py-1.5 rounded border border-slate-600 text-center"
        />
        <span className="text-slate-500">-</span>
        <input
          type="number"
          min={1}
          max={99}
          value={filters.maxOverall}
          onChange={(e) => {
            const newMax = parseInt(e.target.value) || 99;
            // Ensure maxOverall >= minOverall
            onChange({
              ...filters,
              maxOverall: newMax,
              minOverall: Math.min(newMax, filters.minOverall),
            });
          }}
          className="w-14 bg-slate-700 text-white text-sm px-2 py-1.5 rounded border border-slate-600 text-center"
        />
      </div>

      {/* Max Price */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">Max Price:</span>
        <select
          value={filters.maxPrice}
          onChange={(e) =>
            onChange({ ...filters, maxPrice: parseInt(e.target.value) })
          }
          className="select-chevron bg-slate-700 text-white text-sm px-3 py-2 rounded border border-slate-600"
        >
          <option value={0}>Any</option>
          <option value={1000000}>$1M</option>
          <option value={5000000}>$5M</option>
          <option value={10000000}>$10M</option>
          <option value={25000000}>$25M</option>
          <option value={50000000}>$50M</option>
        </select>
      </div>

      {/* Max Age */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">Max Age:</span>
        <select
          value={filters.maxAge}
          onChange={(e) =>
            onChange({ ...filters, maxAge: parseInt(e.target.value) })
          }
          className="select-chevron bg-slate-700 text-white text-sm px-3 py-2 rounded border border-slate-600"
        >
          <option value={99}>Any</option>
          <option value={23}>U23</option>
          <option value={25}>U25</option>
          <option value={28}>U28</option>
          <option value={30}>U30</option>
          <option value={33}>U33</option>
        </select>
      </div>
    </div>
  );
}
