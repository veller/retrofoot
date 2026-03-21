import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TEAMS } from '@retrofoot/core';
import { apiFetch } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

type LeagueDetail = {
  id: string;
  inviteCode: string;
  status: string;
  maxMembers: number;
  currentRound: number;
  hostUserId: string;
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type MemberRow = {
  userId: string;
  role: string;
  onlineTeamId: string | null;
  lobbyPickTemplateId: string | null;
  teamName: string | null;
  teamShortName: string | null;
  displayName: string;
  joinedAt: string;
};

type TeamTemplate = {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  reputation: number;
};

type ClaimRow = {
  userId: string;
  templateId: string;
  displayName: string;
};

function templateLabel(templateId: string | null): string | null {
  if (!templateId) return null;
  const t = TEAMS.find((x) => x.id === templateId);
  return t ? t.name : templateId;
}

export function LeagueLobbyPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [teamPool, setTeamPool] = useState<{
    templates: TeamTemplate[];
    claims: ClaimRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [pickSaving, setPickSaving] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!leagueId) return;
    setError(null);
    try {
      const [lr, mr] = await Promise.all([
        apiFetch(`/api/online/leagues/${leagueId}`),
        apiFetch(`/api/online/leagues/${leagueId}/members`),
      ]);
      if (!lr.ok) {
        setError(lr.status === 403 ? 'Not a member' : 'Not found');
        return;
      }
      if (!mr.ok) {
        setError('Could not load members');
        return;
      }
      const lJson = (await lr.json()) as { league: LeagueDetail };
      const mJson = (await mr.json()) as { members: MemberRow[] };
      setLeague(lJson.league);
      setMembers(mJson.members);

      if (lJson.league.status === 'lobby') {
        const pr = await apiFetch(
          `/api/online/leagues/${leagueId}/lobby/team-pool`,
        );
        if (pr.ok) {
          const pj = (await pr.json()) as {
            templates: TeamTemplate[];
            claims: ClaimRow[];
          };
          setTeamPool(pj);
        } else {
          setTeamPool(null);
        }
      } else {
        setTeamPool(null);
      }
    } catch {
      setError('Failed to load lobby');
    }
  }, [leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isHost = useMemo(
    () => Boolean(user?.id && league?.hostUserId === user.id),
    [user?.id, league?.hostUserId],
  );

  const everyonePicked = useMemo(() => {
    if (!members?.length) return false;
    return members.every((m) => m.lobbyPickTemplateId);
  }, [members]);

  const canStart = useMemo(() => {
    if (!league || league.status !== 'lobby' || !isHost) return false;
    if ((members?.length ?? 0) < 2) return false;
    return everyonePicked;
  }, [league, isHost, members?.length, everyonePicked]);

  const myPickId =
    user?.id && members
      ? members.find((m) => m.userId === user.id)?.lobbyPickTemplateId ?? null
      : null;

  const inviteJoinUrl =
    league?.status === 'lobby'
      ? `${window.location.origin}/online/join/${league.inviteCode}`
      : null;

  const copyInviteLink = async () => {
    if (!inviteJoinUrl) return;
    setCopyHint(null);
    try {
      await navigator.clipboard.writeText(inviteJoinUrl);
      setCopyHint('Link copied');
      window.setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint('Could not copy — select the link and copy manually');
      window.setTimeout(() => setCopyHint(null), 4000);
    }
  };

  const handlePickClub = async (templateId: string) => {
    if (!leagueId || pickSaving) return;
    setPickError(null);
    setPickSaving(true);
    try {
      const res = await apiFetch(
        `/api/online/leagues/${leagueId}/my-lobby-pick`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setPickError(body.error || 'Could not save pick');
        return;
      }
      await load();
    } catch {
      setPickError('Could not save pick');
    } finally {
      setPickSaving(false);
    }
  };

  const handleStart = async () => {
    if (!leagueId || !canStart || starting) return;
    setStartError(null);
    setStarting(true);
    try {
      const res = await apiFetch(`/api/online/leagues/${leagueId}/start`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStartError(body.error || 'Could not start league');
        return;
      }
      await load();
    } catch {
      setStartError('Could not start league');
    } finally {
      setStarting(false);
    }
  };

  if (!leagueId) {
    return null;
  }

  const seasonLabel =
    league?.settings && typeof league.settings.seasonLabel === 'string'
      ? league.settings.seasonLabel
      : null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-8">
        <Link
          to="/online"
          className="text-sm text-slate-400 hover:text-pitch-400 transition-colors"
        >
          ← Online
        </Link>
        <Link
          to="/"
          className="text-sm text-slate-400 hover:text-pitch-400 transition-colors"
        >
          Home
        </Link>
      </div>

      {error ? (
        <p className="text-red-400 mb-4">{error}</p>
      ) : !league ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <h1 className="font-pixel text-xl text-amber-400 mb-2">
            {league.status === 'lobby' ? 'LOBBY' : 'LEAGUE'}
          </h1>

          {league.status === 'lobby' ? (
            <>
              <p className="text-slate-400 text-sm mb-4">
                Share this code with friends:
              </p>
              <div className="bg-slate-800 border-2 border-amber-600/50 p-4 mb-4 text-center">
                <span className="font-mono text-3xl tracking-widest text-amber-300">
                  {league.inviteCode}
                </span>
              </div>
              <div className="mb-6 space-y-2">
                <p className="text-slate-500 text-xs uppercase tracking-wide">
                  Invite link (friends must be signed in)
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    readOnly
                    value={inviteJoinUrl ?? ''}
                    className="flex-1 bg-slate-950 border border-slate-600 px-3 py-2 text-xs text-slate-300 font-mono truncate"
                    aria-label="Invite link"
                  />
                  <button
                    type="button"
                    onClick={() => void copyInviteLink()}
                    className="shrink-0 bg-slate-700 hover:bg-slate-600 font-bold px-4 py-2 text-sm border border-slate-500"
                  >
                    Copy link
                  </button>
                </div>
                {copyHint ? (
                  <p className="text-pitch-400 text-xs">{copyHint}</p>
                ) : null}
              </div>

              <section className="mb-8 border-t border-slate-700 pt-6">
                <h2 className="font-pixel text-sm text-pitch-400 mb-2">
                  CHOOSE YOUR CLUB
                </h2>
                <p className="text-slate-500 text-sm mb-4">
                  Same fictional clubs as career mode. Each club can only be
                  taken once. The host can start once everyone has picked.
                </p>
                {pickError ? (
                  <p className="text-red-400 text-sm mb-3">{pickError}</p>
                ) : null}
                {!teamPool ? (
                  <p className="text-slate-500 text-sm">Loading clubs…</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {teamPool.templates.map((t) => {
                      const claim = teamPool.claims.find(
                        (c) => c.templateId === t.id,
                      );
                      const takenByOther =
                        claim && claim.userId !== user?.id;
                      const isMine = myPickId === t.id;
                      const disabled = Boolean(takenByOther) || pickSaving;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => void handlePickClub(t.id)}
                          className={`p-3 rounded border-2 text-left transition-all ${
                            isMine
                              ? 'border-pitch-400 bg-pitch-900/30'
                              : takenByOther
                                ? 'border-slate-700 bg-slate-900/50 opacity-50 cursor-not-allowed'
                                : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                          }`}
                        >
                          <div
                            className="w-8 h-8 rounded-full mb-2"
                            style={{ backgroundColor: t.primaryColor }}
                          />
                          <p className="text-white font-medium text-xs truncate">
                            {t.name}
                          </p>
                          <p className="text-slate-500 text-[10px]">
                            Rep {t.reputation}
                          </p>
                          {claim ? (
                            <p className="text-amber-400/90 text-[10px] mt-1 truncate">
                              {claim.userId === user?.id
                                ? 'Your pick'
                                : `${claim.displayName}`}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : (
            <p className="text-slate-400 text-sm mb-4">
              Invite code{' '}
              <span className="font-mono text-amber-300">{league.inviteCode}</span>
              {seasonLabel ? (
                <>
                  {' '}
                  · Season <span className="text-slate-300">{seasonLabel}</span>
                </>
              ) : null}
            </p>
          )}

          <div className="text-xs text-slate-500 mb-6 space-y-1">
            <p>Status: {league.status}</p>
            <p>Max players: {league.maxMembers}</p>
          </div>

          <h2 className="font-pixel text-sm text-slate-500 mb-2">PLAYERS</h2>
          {members === null ? (
            <p className="text-slate-500 text-sm">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="bg-slate-800 border border-slate-600 px-3 py-2 flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-center sm:gap-2"
                >
                  <div>
                    <span>{m.displayName}</span>
                    {league.status === 'lobby' && m.lobbyPickTemplateId ? (
                      <p className="text-pitch-400 text-sm font-medium">
                        {templateLabel(m.lobbyPickTemplateId)}
                      </p>
                    ) : null}
                    {m.teamName ? (
                      <p className="text-pitch-400 text-sm font-medium">
                        {m.teamName}
                        {m.teamShortName ? ` (${m.teamShortName})` : ''}
                      </p>
                    ) : null}
                    {league.status === 'lobby' && !m.lobbyPickTemplateId ? (
                      <p className="text-amber-500/90 text-xs">
                        Still choosing a club…
                      </p>
                    ) : null}
                  </div>
                  <span className="text-slate-500 text-sm shrink-0">
                    {m.role === 'host' ? 'Host' : 'Player'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {league.status === 'lobby' && isHost ? (
            <div className="mt-8 border-t border-slate-700 pt-4 space-y-3">
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!canStart || starting}
                className="w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold py-3 px-4 border-2 border-amber-500"
              >
                {starting ? 'STARTING…' : 'START LEAGUE'}
              </button>
              {(members?.length ?? 0) < 2 ? (
                <p className="text-slate-500 text-sm">
                  At least two players must be in the lobby before you can
                  start.
                </p>
              ) : !everyonePicked ? (
                <p className="text-slate-500 text-sm">
                  Every player must choose a unique club before you can start the
                  season.
                </p>
              ) : (
                <p className="text-slate-500 text-sm">
                  Fixtures are generated as a full round-robin (home and away).
                </p>
              )}
              {startError ? (
                <p className="text-red-400 text-sm">{startError}</p>
              ) : null}
            </div>
          ) : null}

          {league.status === 'active' ? (
            <div className="mt-8 border-t border-slate-700 pt-4 space-y-3 flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <Link
                to={`/online/league/${leagueId}/club`}
                className="inline-block bg-pitch-700 hover:bg-pitch-600 text-white font-bold py-3 px-4 border-2 border-pitch-500 text-center"
              >
                MY CLUB &amp; TACTICS
              </Link>
              <Link
                to={`/online/league/${leagueId}/season`}
                className="inline-block bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold py-3 px-4 border-2 border-amber-700/50 text-center"
              >
                TABLE &amp; FIXTURES
              </Link>
              <p className="text-slate-500 text-sm w-full">
                Squad screen matches career mode: formation, lineup, bench, and
                posture. Transfer market comes later.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
