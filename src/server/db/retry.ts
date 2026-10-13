import type { Db } from "./client";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Postgres asks for a retry with these: a deadlock it resolved by aborting one side, and a
// lock that could not be taken in time.
const RETRYABLE = new Set(["40P01", "55P03", "40001"]);

function codeOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

/** Runs a transaction, repeating it when Postgres reports a transient conflict. */
export async function transactionWithRetry<T>(
  db: Db,
  run: (tx: Tx) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.transaction(run);
    } catch (error) {
      if (attempt >= attempts || !RETRYABLE.has(codeOf(error) ?? "")) throw error;
    }
  }
}
