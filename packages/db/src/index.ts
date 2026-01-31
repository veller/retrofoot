// ============================================================================
// RETROFOOT - Database Package
// ============================================================================

import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

// Re-export schema
export * from './schema'

// Create database client for Cloudflare D1
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

// Type for the database client
export type Database = ReturnType<typeof createDb>
