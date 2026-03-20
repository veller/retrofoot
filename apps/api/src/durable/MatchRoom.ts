import { DurableObject } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { simulateMatchStep, resumeFromHalfTime } from '@retrofoot/core';
import type { CloudflareBindings } from '../lib/auth';
import { isOnlineDevSinglePlayerMatch } from '../lib/online-dev';
import { loadOnlineMatchBootstrap } from '../lib/online-match-load';
import {
  type OnlineRoomState,
  matchConfigFromLive,
  markOnlineSessionLive,
  persistFinishedOnlineMatch,
} from '../lib/online-match-persist';

const STORAGE_KEY = 'room';
const TICK_MS = 480;

function fixtureIdFromRequest(request: Request): string | null {
  try {
    const u = new URL(request.url);
    const m = u.pathname.match(/\/api\/online\/match\/([^/]+)\/ws$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * One DO instance per `leagueId:fixtureId` name.
 * Runs core simulation ticks via alarm; both humans must connect to start;
 * half-time resumes after both send `{ "type": "half_ready" }`.
 */
export class MatchRoom extends DurableObject<CloudflareBindings> {
  private wsUsers = new Map<WebSocket, string>();
  private bootstrapPromise: Promise<
    Awaited<ReturnType<typeof loadOnlineMatchBootstrap>>
  > | null = null;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
  }

  private broadcastPayload(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        /* ignore */
      }
    }
  }

  private buildTickMessage(room: OnlineRoomState) {
    const s = room.live.state;
    const devMode = isOnlineDevSinglePlayerMatch(this.env);
    return {
      type: 'tick' as const,
      minute: s.minute,
      phase: s.phase,
      homeScore: s.homeScore,
      awayScore: s.awayScore,
      possession: s.possession,
      event: room.live.latestEvent,
      ...(devMode ? { devMode: true as const } : {}),
    };
  }

  private ensureBootstrap(fixtureId: string) {
    if (!this.bootstrapPromise) {
      const db = drizzle(this.env.DB);
      this.bootstrapPromise = loadOnlineMatchBootstrap(db, fixtureId);
    }
    return this.bootstrapPromise;
  }

  private async tryStartMatch(fixtureId: string): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const existing =
        await this.ctx.storage.get<OnlineRoomState>(STORAGE_KEY);
      if (existing?.live) return;

      const bootstrap = await this.ensureBootstrap(fixtureId);
      if (!bootstrap) {
        this.broadcastPayload({
          type: 'error',
          code: 'load_failed',
          message: 'Fixture not available or already played.',
        });
        return;
      }

      if (!bootstrap.homeUserId || !bootstrap.awayUserId) {
        this.broadcastPayload({
          type: 'error',
          code: 'unassigned',
          message: 'Both teams need assigned managers before kickoff.',
        });
        return;
      }

      const connected = new Set(this.wsUsers.values());
      const hasHome = connected.has(bootstrap.homeUserId);
      const hasAway = connected.has(bootstrap.awayUserId);
      const devSolo = isOnlineDevSinglePlayerMatch(this.env);
      const singleSocketSolo =
        devSolo &&
        connected.size === 1 &&
        (hasHome || hasAway);
      const bothManagers = hasHome && hasAway;
      if (!bothManagers && !singleSocketSolo) {
        return;
      }

      const room: OnlineRoomState = {
        live: bootstrap.live,
        leagueId: bootstrap.leagueId,
        seasonLabel: bootstrap.seasonLabel,
        homeUserId: bootstrap.homeUserId,
        awayUserId: bootstrap.awayUserId,
        waitingHalf: false,
        homeHalfReady: false,
        awayHalfReady: false,
        persisted: false,
      };

      await this.ctx.storage.put(STORAGE_KEY, room);
      const db = drizzle(this.env.DB);
      await markOnlineSessionLive(db, fixtureId);
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
      this.broadcastPayload({ type: 'match_started', fixtureId });
      this.broadcastPayload(this.buildTickMessage(room));
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Upgrade Required', { status: 426 });
    }

    const fixtureId = fixtureIdFromRequest(request);
    if (!fixtureId) {
      return new Response('Bad path', { status: 400 });
    }

    const userId = request.headers.get('X-RF-User')?.trim() ?? '';
    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    this.wsUsers.set(server, userId);

    const devMode = isOnlineDevSinglePlayerMatch(this.env);
    const room = await this.ctx.storage.get<OnlineRoomState>(STORAGE_KEY);
    if (room?.live) {
      server.send(
        JSON.stringify({
          type: 'welcome',
          resumed: true,
          fixtureId,
          waitingHalf: room.waitingHalf,
          ...(devMode ? { devMode: true } : {}),
        }),
      );
      server.send(JSON.stringify(this.buildTickMessage(room)));
    } else {
      server.send(
        JSON.stringify({
          type: 'welcome',
          fixtureId,
          waiting: true,
          ...(devMode ? { devMode: true } : {}),
        }),
      );
      void this.tryStartMatch(fixtureId);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<OnlineRoomState>(STORAGE_KEY);
      if (!room?.live || room.persisted) {
        return;
      }

      if (room.waitingHalf || room.live.state.phase === 'half_time') {
        return;
      }

      const config = matchConfigFromLive(room.live);
      const ev = simulateMatchStep(room.live.state, config);
      room.live.latestEvent = ev;

      await this.ctx.storage.put(STORAGE_KEY, room);
      this.broadcastPayload(this.buildTickMessage(room));

      if (ev?.type === 'half_time') {
        room.waitingHalf = true;
        room.homeHalfReady = false;
        room.awayHalfReady = false;
        await this.ctx.storage.put(STORAGE_KEY, room);
        this.broadcastPayload({
          type: 'half_time_wait',
          message: isOnlineDevSinglePlayerMatch(this.env)
            ? 'Half-time (dev: one manager can continue).'
            : 'Both managers must tap continue to start the second half.',
        });
        return;
      }

      if (ev?.type === 'full_time') {
        const db = drizzle(this.env.DB);
        await persistFinishedOnlineMatch(db, this.env.DB, {
          live: room.live,
          leagueId: room.leagueId,
          seasonLabel: room.seasonLabel,
        });
        room.persisted = true;
        await this.ctx.storage.put(STORAGE_KEY, room);
        this.broadcastPayload({
          type: 'full_time',
          homeScore: room.live.state.homeScore,
          awayScore: room.live.state.awayScore,
        });
        return;
      }

      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const text =
      typeof message === 'string'
        ? message
        : new TextDecoder().decode(message);

    let parsed: { type?: string } = {};
    try {
      parsed = JSON.parse(text) as { type?: string };
    } catch {
      return;
    }

    if (parsed.type !== 'half_ready') {
      return;
    }

    const userId = this.wsUsers.get(ws);
    if (!userId) return;

    void this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<OnlineRoomState>(STORAGE_KEY);
      if (!room?.live || !room.waitingHalf) return;

      if (userId === room.homeUserId) room.homeHalfReady = true;
      if (userId === room.awayUserId) room.awayHalfReady = true;

      const distinct = new Set(this.wsUsers.values());
      const devSoloShortcut =
        isOnlineDevSinglePlayerMatch(this.env) &&
        distinct.size === 1 &&
        (userId === room.homeUserId || userId === room.awayUserId) &&
        (room.homeHalfReady || room.awayHalfReady);

      if (
        !devSoloShortcut &&
        (!room.homeHalfReady || !room.awayHalfReady)
      ) {
        await this.ctx.storage.put(STORAGE_KEY, room);
        this.broadcastPayload({
          type: 'half_ready_ack',
          userId,
        });
        return;
      }

      resumeFromHalfTime(room.live.state);
      room.waitingHalf = false;
      room.homeHalfReady = false;
      room.awayHalfReady = false;
      await this.ctx.storage.put(STORAGE_KEY, room);
      this.broadcastPayload({ type: 'second_half' });
      this.broadcastPayload(this.buildTickMessage(room));
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    });
  }

  webSocketClose(ws: WebSocket): void {
    this.wsUsers.delete(ws);
  }
}
