import { existsSync } from "node:fs";
import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/server/db/client";

config({ path: ".env.local", quiet: true });

const MIGRATIONS = "./src/server/db/migrations";

async function main(): Promise<void> {
  // Migrations need a direct (unpooled) connection when one is configured.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!existsSync(`${MIGRATIONS}/meta/_journal.json`)) {
    console.log("No migrations yet.");
    return;
  }
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
