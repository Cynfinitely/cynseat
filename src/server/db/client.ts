import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

export type DbHandle = {
  db: Db;
  pool: Pool;
};

export function createDb(connectionString: string, options: { max?: number } = {}): DbHandle {
  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    // A killed function must not sit on row locks.
    idle_in_transaction_session_timeout: 10_000,
  });
  return { db: drizzle(pool, { schema }), pool };
}

const globalForDb = globalThis as unknown as { cynseatDb?: DbHandle };

/** Process-wide handle, reused across hot reloads in development. */
export function getDb(): DbHandle {
  if (!globalForDb.cynseatDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.cynseatDb = createDb(url);
  }
  return globalForDb.cynseatDb;
}
