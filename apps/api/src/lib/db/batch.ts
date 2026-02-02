// ============================================================================
// RETROFOOT - D1 Batch Utilities
// ============================================================================
// Reusable helpers for D1 batch operations with chunking support

import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { drizzle } from 'drizzle-orm/d1';

/**
 * D1 has a limit of 100 bound parameters per batch.
 * Calculate safe chunk sizes based on columns per row.
 */
const D1_VARIABLE_LIMIT = 100;

/**
 * Calculate the maximum chunk size for batch inserts
 * @param columnsPerRow Number of columns in each row
 * @returns Maximum rows per chunk to stay under D1 limits
 */
export function calculateChunkSize(columnsPerRow: number): number {
  return Math.floor(D1_VARIABLE_LIMIT / columnsPerRow);
}

/**
 * Insert records in chunks to avoid D1 variable limits
 *
 * @param db Drizzle database instance
 * @param table Drizzle table to insert into
 * @param values Array of values to insert
 * @param columnsPerRow Number of columns per row (for chunk size calculation)
 */
export async function batchInsertChunked<T>(
  db: ReturnType<typeof drizzle>,
  table: Parameters<ReturnType<typeof drizzle>['insert']>[0],
  values: T[],
  columnsPerRow: number,
): Promise<void> {
  if (values.length === 0) return;

  const chunkSize = calculateChunkSize(columnsPerRow);

  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await db.insert(table).values(chunk as Parameters<typeof db.insert>[0]['$inferInsert'][]);
  }
}

/**
 * Execute prepared statements in batch, chunking if necessary
 *
 * @param d1 D1 database instance
 * @param statements Array of prepared statements
 */
export async function executeBatch(
  d1: D1Database,
  statements: D1PreparedStatement[],
): Promise<void> {
  if (statements.length === 0) return;
  await d1.batch(statements);
}

/**
 * Execute multiple independent batch operations in parallel
 *
 * @param operations Array of batch operations (each returns a promise)
 */
export async function executeBatchParallel(
  operations: Array<Promise<unknown> | (() => Promise<unknown>)>,
): Promise<void> {
  const promises = operations.map((op) =>
    typeof op === 'function' ? op() : op,
  );
  await Promise.all(promises);
}

/**
 * Build D1 prepared statements from an array of updates
 *
 * @param d1 D1 database instance
 * @param sql SQL template with ? placeholders
 * @param updates Array of update objects
 * @param bindFn Function to extract bind values from each update
 */
/**
 * Build D1 prepared statements from an array of updates
 *
 * @param d1 D1 database instance
 * @param sql SQL template with ? placeholders
 * @param updates Array of update objects
 * @param bindFn Function to extract bind values from each update
 *
 * @example
 * const statements = buildStatements(
 *   d1,
 *   'UPDATE users SET name = ?, age = ? WHERE id = ?',
 *   users,
 *   (u) => [u.name, u.age, u.id]
 * );
 */
export function buildStatements<T>(
  d1: D1Database,
  sql: string,
  updates: T[],
  bindFn: (update: T) => unknown[],
): D1PreparedStatement[] {
  return updates.map((update) => {
    const values = bindFn(update);
    // D1's bind() expects all parameters at once via spread
    return d1.prepare(sql).bind(...values);
  });
}
