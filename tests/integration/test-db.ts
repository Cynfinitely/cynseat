import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, inject } from "vitest";
import { createDb, type DbHandle } from "../../src/server/db/client";
import { TEMPLATE_DB } from "./global-setup";

/**
 * Gives the calling test file its own migrated database, cloned from the template.
 * Tests commit for real (no rollback wrapper) so concurrency behaviour is genuine.
 */
export function setupTestDb(options: { max?: number } = {}): () => DbHandle {
  let handle: DbHandle | undefined;
  const name = `t_${randomBytes(6).toString("hex")}`;
  const adminUrl = inject("pgAdminUrl");

  beforeAll(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`);
    await admin.end();

    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    handle = createDb(url.toString(), { max: options.max ?? 20 });
  });

  afterAll(async () => {
    await handle?.pool.end();
  });

  return () => {
    if (!handle) throw new Error("setupTestDb(): database is only available inside tests");
    return handle;
  };
}
