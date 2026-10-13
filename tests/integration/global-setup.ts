import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import type { TestProject } from "vitest/node";
import { createDb } from "../../src/server/db/client";

const MIGRATIONS = "./src/server/db/migrations";
export const TEMPLATE_DB = "cynseat_template";

declare module "vitest" {
  export interface ProvidedContext {
    /** Connection string to the server's maintenance database. */
    pgAdminUrl: string;
  }
}

// Testcontainers does not read Docker contexts, so point it at Colima when that is what runs.
function pointAtColimaIfPresent(): void {
  if (process.env.DOCKER_HOST) return;
  const socket = join(homedir(), ".colima/default/docker.sock");
  if (!existsSync(socket)) return;
  process.env.DOCKER_HOST = `unix://${socket}`;
  process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ??= "/var/run/docker.sock";
}

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  pointAtColimaIfPresent();
  container = await new PostgreSqlContainer("postgres:17-alpine")
    // Each test file gets its own database, so allow plenty of connections.
    .withCommand(["postgres", "-c", "max_connections=300", "-c", "fsync=off"])
    .start();

  const adminUrl = container.getConnectionUri();
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  await admin.end();

  // Apply migrations once; every test database is cloned from this template.
  if (existsSync(`${MIGRATIONS}/meta/_journal.json`)) {
    const templateUrl = new URL(adminUrl);
    templateUrl.pathname = `/${TEMPLATE_DB}`;
    const { db, pool } = createDb(templateUrl.toString(), { max: 1 });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await pool.end();
  }

  project.provide("pgAdminUrl", adminUrl);

  return async () => {
    await container?.stop();
  };
}
