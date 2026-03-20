import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useIsAdmin } from '@/hooks';
import { SeoHead } from '@/components';

export type AdminAnalyticsEventRow = {
  id: string;
  eventName: string;
  userId: string;
  userEmail: string | null;
  saveId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminSegmentType =
  | 'no_save'
  | 'never_played'
  | 'one_match'
  | 'inactive'
  | 'login_no_match';

type AdminMetricsTotals = {
  registeredUsers: number;
  usersWithoutSave: number;
  usersWithSave: number;
  usersNeverPlayedLeague: number;
  usersPlayedExactlyOneLeagueMatch: number;
  usersInactiveEarlyStall: number;
  usersLoginNeverMatchCompleted: number;
};

type AdminMetricsResponse = {
  generatedAt: string;
  windows: { inactiveDays: number; stallRound: number };
  totals: AdminMetricsTotals;
  methodology: string[];
};

type AdminSegmentRow = {
  userId: string;
  email: string;
  createdAt: string | null;
};

const PAYLOAD_PREVIEW = 80;

function formatLocalTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortId(id: string, max = 10): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max)}…`;
}

function payloadPreview(payload: Record<string, unknown> | null): string {
  if (!payload || Object.keys(payload).length === 0) return '—';
  const s = JSON.stringify(payload);
  if (s.length <= PAYLOAD_PREVIEW) return s;
  return `${s.slice(0, PAYLOAD_PREVIEW)}…`;
}

type AdminTab = 'insights' | 'raw';

function adminSubTabClass(isActive: boolean, edge: 'left' | 'right'): string {
  const base = 'px-3 py-1.5 text-sm font-medium ';
  const state = isActive
    ? 'bg-pitch-700 text-white'
    : 'bg-slate-800 text-slate-400 hover:text-white';
  const border = edge === 'right' ? ' border-l border-slate-600' : '';
  return base + state + border;
}

export function AdminPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: adminGateLoading } = useIsAdmin();

  const [tab, setTab] = useState<AdminTab>('insights');

  const [inactiveDays, setInactiveDays] = useState(14);
  const [stallRound, setStallRound] = useState(5);
  const [appliedInactiveDays, setAppliedInactiveDays] = useState(14);
  const [appliedStallRound, setAppliedStallRound] = useState(5);

  const [metrics, setMetrics] = useState<AdminMetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [segmentType, setSegmentType] = useState<AdminSegmentType | null>(null);
  const [segmentItems, setSegmentItems] = useState<AdminSegmentRow[]>([]);
  const [segmentCursor, setSegmentCursor] = useState<string | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);

  const [events, setEvents] = useState<AdminAnalyticsEventRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [eventNameFilter, setEventNameFilter] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (adminGateLoading) return;
    if (!isAdmin) {
      navigate('/', { replace: true });
    }
  }, [adminGateLoading, isAdmin, navigate]);

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const params = new URLSearchParams();
      params.set('inactiveDays', String(appliedInactiveDays));
      params.set('stallRound', String(appliedStallRound));
      const response = await apiFetch(`/api/admin/metrics?${params}`);
      if (response.status === 403 || response.status === 404) {
        navigate('/', { replace: true });
        return;
      }
      if (!response.ok) {
        setMetricsError('Failed to load metrics.');
        return;
      }
      const data = (await response.json()) as AdminMetricsResponse;
      setMetrics(data);
    } catch {
      setMetricsError('Failed to load metrics.');
    } finally {
      setMetricsLoading(false);
    }
  }, [appliedInactiveDays, appliedStallRound, navigate]);

  useEffect(() => {
    if (adminGateLoading || !isAdmin || tab !== 'insights') return;
    void fetchMetrics();
  }, [adminGateLoading, isAdmin, tab, fetchMetrics]);

  const fetchSegmentPage = useCallback(
    async (type: AdminSegmentType, cursor: string | null, reset: boolean) => {
      setSegmentLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('type', type);
        params.set('inactiveDays', String(appliedInactiveDays));
        params.set('stallRound', String(appliedStallRound));
        if (cursor) params.set('cursor', cursor);
        const response = await apiFetch(`/api/admin/metrics/segment?${params}`);
        if (response.status === 403) {
          navigate('/', { replace: true });
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as {
          items: AdminSegmentRow[];
          nextCursor: string | null;
        };
        setSegmentItems((prev) =>
          reset ? data.items : [...prev, ...data.items],
        );
        setSegmentCursor(data.nextCursor ?? null);
      } finally {
        setSegmentLoading(false);
      }
    },
    [appliedInactiveDays, appliedStallRound, navigate],
  );

  const openSegment = (type: AdminSegmentType) => {
    setSegmentType(type);
    setSegmentItems([]);
    setSegmentCursor(null);
    void fetchSegmentPage(type, null, true);
  };

  const closeSegment = () => {
    setSegmentType(null);
    setSegmentItems([]);
    setSegmentCursor(null);
  };

  const applyWindowParams = () => {
    setAppliedInactiveDays(Math.min(365, Math.max(1, inactiveDays || 14)));
    setAppliedStallRound(Math.min(38, Math.max(1, stallRound || 5)));
  };

  const fetchPage = useCallback(
    async (cursor: string | null, reset: boolean) => {
      setListLoading(true);
      setListError(null);
      try {
        const params = new URLSearchParams();
        if (cursor) params.set('cursor', cursor);
        if (appliedFilter) params.set('eventName', appliedFilter);
        const q = params.toString();
        const path =
          q.length > 0
            ? `/api/admin/analytics-events?${q}`
            : '/api/admin/analytics-events';
        const response = await apiFetch(path);
        if (response.status === 403 || response.status === 404) {
          navigate('/', { replace: true });
          return;
        }
        if (!response.ok) {
          setListError('Failed to load analytics events.');
          return;
        }
        const data = (await response.json()) as {
          events: AdminAnalyticsEventRow[];
          nextCursor: string | null;
        };
        setEvents((prev) => (reset ? data.events : [...prev, ...data.events]));
        setNextCursor(data.nextCursor ?? null);
      } catch {
        setListError('Failed to load analytics events.');
      } finally {
        setListLoading(false);
      }
    },
    [appliedFilter, navigate],
  );

  const applyFilter = () => {
    setAppliedFilter(eventNameFilter.trim());
  };

  useEffect(() => {
    if (adminGateLoading || !isAdmin || tab !== 'raw') return;
    void fetchPage(null, true);
  }, [adminGateLoading, isAdmin, tab, fetchPage]);

  const countsByEvent = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      m.set(e.eventName, (m.get(e.eventName) ?? 0) + 1);
    }
    return m;
  }, [events]);

  const distinctNames = useMemo(
    () => [...countsByEvent.keys()].sort(),
    [countsByEvent],
  );

  if (adminGateLoading || !isAdmin) {
    return (
      <>
        <SeoHead
          title="Admin | RetroFoot"
          description="RetroFoot admin."
          noindex
        />
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <p className="text-slate-400">Loading…</p>
        </div>
      </>
    );
  }

  const t = metrics?.totals;

  return (
    <>
      <SeoHead
        title="Admin | RetroFoot"
        description="Product insights and analytics."
        noindex
      />
      <div className="min-h-screen bg-slate-900 text-slate-200">
        <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="font-pixel text-lg text-pitch-400 tracking-wide">
              Admin
            </h1>
            <nav className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                type="button"
                onClick={() => setTab('insights')}
                className={adminSubTabClass(tab === 'insights', 'left')}
              >
                Insights
              </button>
              <button
                type="button"
                onClick={() => setTab('raw')}
                className={adminSubTabClass(tab === 'raw', 'right')}
              >
                Raw events
              </button>
            </nav>
            <Link
              to="/"
              className="text-sm text-slate-400 hover:text-white underline"
            >
              Home
            </Link>
          </div>
        </header>

        {tab === 'insights' ? (
          <div className="p-4 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Inactive days
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={inactiveDays}
                  onChange={(e) =>
                    setInactiveDays(Number.parseInt(e.target.value, 10) || 14)
                  }
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white w-24"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Stall round (max)
                <input
                  type="number"
                  min={1}
                  max={38}
                  value={stallRound}
                  onChange={(e) =>
                    setStallRound(Number.parseInt(e.target.value, 10) || 5)
                  }
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white w-24"
                />
              </label>
              <button
                type="button"
                onClick={applyWindowParams}
                className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded"
              >
                Apply window
              </button>
              <button
                type="button"
                disabled={metricsLoading}
                onClick={() => void fetchMetrics()}
                className="px-3 py-2 text-sm bg-pitch-700 hover:bg-pitch-600 rounded disabled:opacity-50"
              >
                Refresh metrics
              </button>
            </div>

            {metricsError ? (
              <p className="text-red-400 text-sm">{metricsError}</p>
            ) : null}

            {metricsLoading && !metrics ? (
              <p className="text-slate-500">Loading metrics…</p>
            ) : null}

            {t ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InsightCard
                  label="Registered users"
                  value={t.registeredUsers}
                  onSample={null}
                />
                <InsightCard
                  label="Users with a save"
                  value={t.usersWithSave}
                  onSample={null}
                />
                <InsightCard
                  label="No save created"
                  value={t.usersWithoutSave}
                  onSample={() => openSegment('no_save')}
                />
                <InsightCard
                  label="Never played a league match"
                  description="Max standings.played = 0 across saves"
                  value={t.usersNeverPlayedLeague}
                  onSample={() => openSegment('never_played')}
                />
                <InsightCard
                  label="Exactly one league match played"
                  description="Max standings.played = 1"
                  value={t.usersPlayedExactlyOneLeagueMatch}
                  onSample={() => openSegment('one_match')}
                />
                <InsightCard
                  label="Inactive (early stall)"
                  description={`No save touch ${appliedInactiveDays}d+, round ≤ ${appliedStallRound}, not game over`}
                  value={t.usersInactiveEarlyStall}
                  onSample={() => openSegment('inactive')}
                />
                <InsightCard
                  label="Logged in, never match_completed event"
                  description="From analytics_events only"
                  value={t.usersLoginNeverMatchCompleted}
                  onSample={() => openSegment('login_no_match')}
                />
              </div>
            ) : null}

            {metrics?.generatedAt ? (
              <p className="text-xs text-slate-500">
                Generated {formatLocalTime(metrics.generatedAt)}
              </p>
            ) : null}

            {metrics?.methodology?.length ? (
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm text-slate-400 space-y-2">
                <p className="text-slate-300 font-medium">Methodology</p>
                <ul className="list-disc pl-5 space-y-1">
                  {metrics.methodology.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-4 max-w-7xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={eventNameFilter}
                onChange={(e) => setEventNameFilter(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white max-w-[200px]"
                aria-label="Filter by event name"
              >
                <option value="">All events</option>
                {distinctNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setEventNameFilter('');
                  setAppliedFilter('');
                }}
                className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={applyFilter}
                className="px-3 py-1.5 text-sm bg-pitch-700 hover:bg-pitch-600 text-white rounded font-medium"
              >
                Apply filter
              </button>
              <button
                type="button"
                disabled={listLoading}
                onClick={() => void fetchPage(null, true)}
                className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center text-sm">
              <span className="text-slate-500">Loaded:</span>
              <span className="text-white font-medium tabular-nums">
                {events.length}
              </span>
              {appliedFilter ? (
                <span className="text-slate-500">
                  (filter:{' '}
                  <code className="text-pitch-300">{appliedFilter}</code>)
                </span>
              ) : null}
              {Array.from(countsByEvent.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => (
                  <span
                    key={name}
                    className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-xs text-slate-300"
                  >
                    {name}: {n}
                  </span>
                ))}
            </div>

            {listError ? (
              <p className="text-red-400 text-sm">{listError}</p>
            ) : null}

            <div className="overflow-x-auto border border-slate-700 rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-800 text-slate-400 uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2 whitespace-nowrap">Time</th>
                    <th className="px-3 py-2 whitespace-nowrap">Event</th>
                    <th className="px-3 py-2 whitespace-nowrap">User</th>
                    <th className="px-3 py-2 whitespace-nowrap">Save</th>
                    <th className="px-3 py-2 min-w-[120px]">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {events.length === 0 && !listLoading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        No events yet.
                      </td>
                    </tr>
                  ) : (
                    events.map((row) => (
                      <tr
                        key={row.id}
                        className="bg-slate-900/50 hover:bg-slate-800/80"
                      >
                        <td
                          className="px-3 py-2 whitespace-nowrap text-slate-300 align-top"
                          title={row.createdAt}
                        >
                          {formatLocalTime(row.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-pitch-300 align-top font-medium whitespace-nowrap">
                          {row.eventName}
                        </td>
                        <td
                          className="px-3 py-2 align-top text-slate-300 max-w-[200px] truncate"
                          title={row.userId}
                        >
                          {row.userEmail ?? shortId(row.userId, 12)}
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          {row.saveId ? (
                            <Link
                              to={`/game/${row.saveId}`}
                              className="text-pitch-400 hover:text-pitch-300 underline font-mono text-xs"
                              title={row.saveId}
                            >
                              {shortId(row.saveId, 12)}
                            </Link>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-xs text-slate-400">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPayloadId((id) =>
                                id === row.id ? null : row.id,
                              )
                            }
                            className="text-left hover:text-pitch-300 w-full"
                          >
                            {expandedPayloadId === row.id
                              ? JSON.stringify(row.payload, null, 2)
                              : payloadPreview(row.payload)}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {nextCursor ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={listLoading}
                  onClick={() => void fetchPage(nextCursor, false)}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded font-medium disabled:opacity-50"
                >
                  {listLoading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {segmentType ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-slate-800 border border-slate-600 rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col shadow-xl">
              <div className="px-4 py-3 border-b border-slate-600 flex justify-between items-center">
                <h2 className="font-bold text-white capitalize">
                  Sample: {segmentType.replace(/_/g, ' ')}
                </h2>
                <button
                  type="button"
                  onClick={closeSegment}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  Close
                </button>
              </div>
              <div className="overflow-auto p-4 flex-1">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-600">
                      <th className="py-2 pr-2">Email</th>
                      <th className="py-2 pr-2">User ID</th>
                      <th className="py-2">Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segmentItems.map((row) => (
                      <tr
                        key={row.userId}
                        className="border-b border-slate-700"
                      >
                        <td className="py-2 pr-2 text-slate-200">
                          {row.email}
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs text-slate-400">
                          {shortId(row.userId, 14)}
                        </td>
                        <td className="py-2 text-slate-400 text-xs">
                          {row.createdAt ? formatLocalTime(row.createdAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {segmentItems.length === 0 && !segmentLoading ? (
                  <p className="text-slate-500 text-sm py-4">No rows.</p>
                ) : null}
                {segmentCursor ? (
                  <button
                    type="button"
                    disabled={segmentLoading}
                    onClick={() =>
                      segmentType &&
                      void fetchSegmentPage(segmentType, segmentCursor, false)
                    }
                    className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-50"
                  >
                    {segmentLoading ? 'Loading…' : 'Load more'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

type InsightCardProps = {
  label: string;
  description?: string;
  value: number;
  onSample: (() => void) | null;
};

function InsightCard({
  label,
  description,
  value,
  onSample,
}: InsightCardProps) {
  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 flex flex-col gap-2">
      <p className="text-slate-400 text-sm font-medium">{label}</p>
      {description ? (
        <p className="text-slate-500 text-xs leading-snug">{description}</p>
      ) : null}
      <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
      {onSample ? (
        <button
          type="button"
          onClick={onSample}
          className="mt-auto text-left text-sm text-pitch-400 hover:text-pitch-300 underline"
        >
          View sample
        </button>
      ) : null}
    </div>
  );
}
