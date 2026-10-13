// Composition root used by the Next.js layer: wires use-cases to the real database.
import { getDb } from "./db/client";
import { checkHealth, type HealthReport } from "./modules/health/service";

export function getHealth(): Promise<HealthReport> {
  return checkHealth(getDb().db);
}
