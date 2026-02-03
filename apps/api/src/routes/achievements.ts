// ============================================================================
// RETROFOOT - Achievements Routes
// ============================================================================
// Route handlers for achievements

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { saves, achievements } from '@retrofoot/db/schema';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';
import {
  getAchievementDefinition,
  getAchievementsSummary,
  type UnlockedAchievement,
} from '@retrofoot/core/achievements';

export const achievementsRoutes = new Hono<{ Bindings: Env }>();

// Get all achievements for a save
achievementsRoutes.get('/:saveId', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const saveId = c.req.param('saveId');
  const db = drizzle(c.env.DB);

  // Verify ownership
  const saveResult = await db
    .select({ userId: saves.userId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Get all achievements for this save
  const achievementsResult = await db
    .select()
    .from(achievements)
    .where(eq(achievements.saveId, saveId));

  // Transform to UnlockedAchievement for summary
  const unlockedAchievements: UnlockedAchievement[] = achievementsResult.map(
    (a) => ({
      key: a.key,
      type: a.type as UnlockedAchievement['type'],
      value: a.value || undefined,
      seasonYear: a.seasonYear || undefined,
      unlockedAt: new Date(a.unlockedAt),
    }),
  );

  // Get summary stats
  const summary = getAchievementsSummary(unlockedAchievements);

  // Enrich with display names
  const enrichedAchievements = achievementsResult.map((a) => {
    const definition = getAchievementDefinition(a.key);
    return {
      id: a.id,
      type: a.type,
      key: a.key,
      name: definition?.name || a.key,
      description: definition?.description || '',
      value: a.value,
      seasonYear: a.seasonYear,
      unlockedAt: a.unlockedAt,
    };
  });

  return c.json({
    achievements: enrichedAchievements,
    summary,
  });
});
