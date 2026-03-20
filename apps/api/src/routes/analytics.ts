import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from '../lib/auth';
import {
  CLIENT_POSTABLE_ANALYTICS_EVENTS,
  CLIENT_POSTABLE_ONLINE_ANALYTICS_EVENTS,
  logAnalyticsEvent,
  logOnlineAnalyticsEvent,
} from '../lib/analytics';
import type { Env } from '../index';

const postableEventEnum = z.enum(CLIENT_POSTABLE_ANALYTICS_EVENTS);

const analyticsEventSchema = z.object({
  eventName: postableEventEnum,
  saveId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const postableOnlineEventEnum = z.enum(CLIENT_POSTABLE_ONLINE_ANALYTICS_EVENTS);

const onlineAnalyticsEventSchema = z.object({
  eventName: postableOnlineEventEnum,
  onlineLeagueId: z.string().min(1).optional(),
  onlineFixtureId: z.string().min(1).optional(),
  onlineMatchSessionId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const analyticsRoutes = new Hono<{ Bindings: Env }>();

analyticsRoutes.post('/events', async (c) => {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: z.infer<typeof analyticsEventSchema>;
  try {
    const rawBody = await c.req.json();
    const parsed = analyticsEventSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: 'Invalid analytics event payload' }, 400);
    }
    body = parsed.data;
  } catch {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    await logAnalyticsEvent(c.env.DB, body.eventName, session.user.id, {
      saveId: body.saveId,
      payload: body.payload,
    });
    return c.json({ success: true }, 202);
  } catch (error) {
    console.error('Failed to insert analytics event:', error);
    return c.json({ error: 'Failed to store analytics event' }, 500);
  }
});

analyticsRoutes.post('/online/events', async (c) => {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: z.infer<typeof onlineAnalyticsEventSchema>;
  try {
    const rawBody = await c.req.json();
    const parsed = onlineAnalyticsEventSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: 'Invalid online analytics payload' }, 400);
    }
    body = parsed.data;
  } catch {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    await logOnlineAnalyticsEvent(c.env.DB, body.eventName, session.user.id, {
      onlineLeagueId: body.onlineLeagueId,
      onlineFixtureId: body.onlineFixtureId,
      onlineMatchSessionId: body.onlineMatchSessionId,
      payload: body.payload,
    });
    return c.json({ success: true }, 202);
  } catch (error) {
    console.error('Failed to insert online analytics event:', error);
    return c.json({ error: 'Failed to store online analytics event' }, 500);
  }
});
