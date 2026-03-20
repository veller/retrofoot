import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';

type LeagueDetail = {
  id: string;
  status: string;
  currentRound: number;
  settings: Record<string, unknown> | null;
};

type StandingRow = {
  position: number;
  teamId: string;
  teamName: string;
  teamShortName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

type FixtureRow = {
  id: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  homeShortName: string;
  awayShortName: string;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  kickoffAt: string | null;
};

type MeResponse = {
  onlineTeamId: string | null;
  team: {
    id: string;
    name: string;
    shortName: string;
  } | null;
};

function formatGoalDifference(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}

function getGoalDifferenceStyle(gd: number): string {
  if (gd > 0) return 'text-green-400';
  if (gd < 0) return 'text-red-400';
  return '';
}

export function OnlineLeagueSeasonPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [seasonLabel, setSeasonLabel] = useState<string | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [fixturesPayload, setFixturesPayload] = useState<{
    rounds: number[];
    fixtures: FixtureRow[];
    currentRound: number;
  } | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roundFilter, setRoundFilter] = useState<number | 'all'>('all');

  const load = useCallback(async () => {
    if (!leagueId) return;
    setError(null);
    try {
      const [lr, sr, fr, mr] = await Promise.all([
        apiFetch(`/api/online/leagues/${leagueId}`),
        apiFetch(`/api/online/leagues/${leagueId}/standings`),
        apiFetch(`/api/online/leagues/${leagueId}/fixtures`),
        apiFetch(`/api/online/leagues/${leagueId}/me`),
      ]);
      if (!lr.ok) {
        setError(lr.status === 403 ? 'Not a member' : 'Not found');
        return;
      }
      if (!sr.ok || !fr.ok || !mr.ok) {
        setError('Could not load season data');
        return;
      }
      const lJson = (await lr.json()) as { league: LeagueDetail };
      const sJson = (await sr.json()) as {
        seasonLabel: string;
        standings: StandingRow[];
      };
      const fJson = (await fr.json()) as {
        seasonLabel: string;
        rounds: number[];
        fixtures: FixtureRow[];
        currentRound: number;
      };
      const mJson = (await mr.json()) as MeResponse;

      setLeague(lJson.league);
      setSeasonLabel(sJson.seasonLabel);
      setStandings(sJson.standings);
      setFixturesPayload({
        rounds: fJson.rounds,
        fixtures: fJson.fixtures,
        currentRound: fJson.currentRound,
      });
      setMe(mJson);
      setRoundFilter(fJson.currentRound ?? lJson.league.currentRound ?? 1);
    } catch {
      setError('Failed to load season');
    }
  }, [leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const myTeamId = me?.team?.id ?? me?.onlineTeamId ?? null;

  const filteredFixtures = useMemo(() => {
    if (!fixturesPayload) return [];
    if (roundFilter === 'all') return fixturesPayload.fixtures;
    return fixturesPayload.fixtures.filter((f) => f.round === roundFilter);
  }, [fixturesPayload, roundFilter]);

  if (!leagueId) {
    return null;
  }

  const seasonFromSettings =
    league?.settings && typeof league.settings.seasonLabel === 'string'
      ? league.settings.seasonLabel
      : seasonLabel;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <Link
          to={`/online/league/${leagueId}`}
          className="text-sm text-slate-400 hover:text-pitch-400 transition-colors"
        >
          ← Lobby
        </Link>
        <Link
          to="/online"
          className="text-sm text-slate-400 hover:text-pitch-400 transition-colors"
        >
          Online home
        </Link>
      </div>

      {error ? (
        <p className="text-red-400 mb-4">{error}</p>
      ) : !league ? (
        <p className="text-slate-500">Loading…</p>
      ) : league.status !== 'active' ? (
        <p className="text-slate-400">
          Season view is available after the host starts the league.
        </p>
      ) : (
        <>
          <header className="mb-6">
            <h1 className="font-pixel text-xl text-amber-400 mb-1">
              SEASON
            </h1>
            {seasonFromSettings ? (
              <p className="text-slate-500 text-sm">
                {seasonFromSettings} · Round {league.currentRound ?? 1} (focus)
              </p>
            ) : null}
            {me?.team ? (
              <p className="text-pitch-400 text-sm mt-2 font-medium">
                Your club: {me.team.name} ({me.team.shortName})
              </p>
            ) : null}
          </header>

          <section className="mb-10">
            <h2 className="font-pixel text-sm text-slate-500 mb-3">TABLE</h2>
            {standings.length === 0 ? (
              <p className="text-slate-500 text-sm">No standings yet.</p>
            ) : (
              <div className="overflow-x-auto bg-slate-800 border border-slate-700">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-600">
                      <th className="text-center py-2 w-8 pl-2">#</th>
                      <th className="text-left py-2">Club</th>
                      <th className="text-center py-2 w-8">P</th>
                      <th className="text-center py-2 w-8 hidden sm:table-cell">
                        W
                      </th>
                      <th className="text-center py-2 w-8 hidden sm:table-cell">
                        D
                      </th>
                      <th className="text-center py-2 w-8 hidden sm:table-cell">
                        L
                      </th>
                      <th className="text-center py-2 w-8 hidden lg:table-cell">
                        GF
                      </th>
                      <th className="text-center py-2 w-8 hidden lg:table-cell">
                        GA
                      </th>
                      <th className="text-center py-2 w-10">GD</th>
                      <th className="text-center py-2 w-10 font-bold text-pitch-400">
                        Pts
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((entry) => {
                      const isMine =
                        Boolean(myTeamId && entry.teamId === myTeamId);
                      const gd = entry.goalsFor - entry.goalsAgainst;
                      return (
                        <tr
                          key={entry.teamId}
                          className={`border-b border-slate-700 ${
                            isMine
                              ? 'bg-pitch-900/40 border-l-4 border-l-pitch-500'
                              : ''
                          }`}
                        >
                          <td className="text-center py-2 pl-2 text-slate-400">
                            {entry.position}
                          </td>
                          <td className="py-2 text-white">
                            <span className="block max-w-[200px] truncate sm:max-w-none">
                              {entry.teamName}
                            </span>
                          </td>
                          <td className="text-center py-2 text-slate-300">
                            {entry.played}
                          </td>
                          <td className="text-center py-2 hidden sm:table-cell">
                            {entry.won}
                          </td>
                          <td className="text-center py-2 hidden sm:table-cell">
                            {entry.drawn}
                          </td>
                          <td className="text-center py-2 hidden sm:table-cell">
                            {entry.lost}
                          </td>
                          <td className="text-center py-2 hidden lg:table-cell">
                            {entry.goalsFor}
                          </td>
                          <td className="text-center py-2 hidden lg:table-cell">
                            {entry.goalsAgainst}
                          </td>
                          <td
                            className={`text-center py-2 ${getGoalDifferenceStyle(gd)}`}
                          >
                            {formatGoalDifference(gd)}
                          </td>
                          <td className="text-center py-2 text-pitch-400 font-bold">
                            {entry.points}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <h2 className="font-pixel text-sm text-slate-500">FIXTURES</h2>
              {fixturesPayload && fixturesPayload.rounds.length > 0 ? (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Round</span>
                  <select
                    value={roundFilter === 'all' ? 'all' : String(roundFilter)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRoundFilter(v === 'all' ? 'all' : Number(v));
                    }}
                    className="bg-slate-800 border border-slate-600 px-2 py-1 text-slate-200"
                  >
                    <option value="all">All</option>
                    {fixturesPayload.rounds.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {filteredFixtures.length === 0 ? (
              <p className="text-slate-500 text-sm">No fixtures.</p>
            ) : (
              <ul className="space-y-2">
                {filteredFixtures.map((f) => {
                  const homeMine =
                    Boolean(myTeamId && f.homeTeamId === myTeamId);
                  const awayMine =
                    Boolean(myTeamId && f.awayTeamId === myTeamId);
                  return (
                    <li
                      key={f.id}
                      className="bg-slate-800 border border-slate-600 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm"
                    >
                      <span className="text-slate-500 text-xs">
                        R{f.round}
                      </span>
                      <div className="flex flex-1 flex-wrap items-center justify-center gap-2 sm:gap-4">
                        <span
                          className={`text-right flex-1 min-w-[100px] ${
                            homeMine ? 'text-pitch-400 font-semibold' : ''
                          }`}
                        >
                          {f.homeName}
                        </span>
                        <span className="text-slate-500 font-mono tabular-nums">
                          {f.played &&
                          f.homeScore != null &&
                          f.awayScore != null ? (
                            <>
                              {f.homeScore} – {f.awayScore}
                            </>
                          ) : (
                            'vs'
                          )}
                        </span>
                        <span
                          className={`text-left flex-1 min-w-[100px] ${
                            awayMine ? 'text-pitch-400 font-semibold' : ''
                          }`}
                        >
                          {f.awayName}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1 sm:w-28">
                        <span className="text-slate-600 text-xs capitalize text-right">
                          {f.status}
                        </span>
                        {(homeMine || awayMine) && !f.played ? (
                          <Link
                            to={`/online/league/${leagueId}/match/${f.id}`}
                            className="text-amber-400 text-xs font-bold hover:underline"
                          >
                            Live room
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
