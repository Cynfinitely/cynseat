import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";

export type HealthReport = {
  status: "ok" | "degraded";
  database: boolean;
};

export async function checkHealth(db: Db): Promise<HealthReport> {
  try {
    await db.execute(sql`select 1`);
    return { status: "ok", database: true };
  } catch {
    return { status: "degraded", database: false };
  }
}
