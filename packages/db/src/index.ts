// ============================================================================
// RETROFOOT - Database Package
// ============================================================================

import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from './schema'

// Re-export schema
export * from './schema'

// D1Database type from Cloudflare Workers
type D1Database = Parameters<typeof drizzle>[0]

// Create database client for Cloudflare D1
export function createDb(d1: D1Database): DrizzleD1Database<typeof schema> {
  return drizzle(d1, { schema })
}

// Type for the database client
export type Database = ReturnType<typeof createDb>
