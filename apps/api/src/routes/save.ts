import { Hono } from 'hono';
import type { Env } from '../index';

// Save management routes
export const saveRoutes = new Hono<{ Bindings: Env }>();

// List all saves for current user
saveRoutes.get('/', async (c) => {
  // TODO: Get userId from auth session, fetch from D1
  return c.json({
    saves: [
      {
        id: 'save-1',
        name: 'My Career',
        club: 'Galo FC',
        season: '2024/25',
        lastPlayed: new Date().toISOString(),
      },
    ],
    message: 'List saves endpoint - implementation pending',
  });
});

// Create new save
saveRoutes.post('/', async (c) => {
  const body = await c.req.json();

  // TODO: Create new save in D1, initialize game state
  return c.json({
    id: `save-${Date.now()}`,
    name: body.name || 'New Save',
    club: body.clubId,
    season: '2024/25',
    created: new Date().toISOString(),
    message: 'Create save endpoint - implementation pending',
  });
});

// Get save details
saveRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Fetch from D1
  return c.json({
    id,
    name: 'My Career',
    club: 'Galo FC',
    season: '2024/25',
    message: 'Get save endpoint - implementation pending',
  });
});

// Delete save
saveRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Delete from D1 (check ownership first)
  return c.json({
    deleted: id,
    message: 'Delete save endpoint - implementation pending',
  });
});
