import { Hono } from 'hono'
import type { Env } from '../index'

// Auth routes - Better Auth will be configured here
export const authRoutes = new Hono<{ Bindings: Env }>()

// Placeholder - Better Auth integration will go here
authRoutes.post('/register', async (c) => {
  // TODO: Implement with Better Auth
  return c.json({ message: 'Registration endpoint - coming soon' }, 501)
})

authRoutes.post('/login', async (c) => {
  // TODO: Implement with Better Auth
  return c.json({ message: 'Login endpoint - coming soon' }, 501)
})

authRoutes.post('/logout', async (c) => {
  // TODO: Implement with Better Auth
  return c.json({ message: 'Logout endpoint - coming soon' }, 501)
})

authRoutes.get('/session', async (c) => {
  // TODO: Return current session info
  return c.json({ message: 'Session endpoint - coming soon' }, 501)
})
