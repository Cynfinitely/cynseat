import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { outboxJobs } from "../../db/schema";
import type { Clock } from "../../ports/clock";
import type { Mailer } from "../../ports/mailer";
import { renderEmail, type EmailLocale, type EmailTemplate } from "./templates";

/** Anything that can run queries: the database handle or an open transaction. */
export type DbOrTx = Pick<Db, "insert" | "select" | "update" | "delete" | "execute">;

export type EmailJob = EmailTemplate & { to: string; locale: EmailLocale };

export const MAX_EMAIL_ATTEMPTS = 6;
const EMAIL_KIND = "email";

/**
 * Records an email to send. Call it inside the transaction that makes the change the email
 * is about, so the email exists if and only if the change committed.
 * Returns the job id, or null when a job with the same `dedupeKey` already exists.
 */
export async function enqueueEmail(
  db: DbOrTx,
  clock: Clock,
  job: EmailJob,
  options: { dedupeKey?: string } = {},
): Promise<string | null> {
  // Stamped from the application clock, the same one `dispatchEmails` compares against;
  // the database's own clock can differ by enough to make a fresh job look not yet due.
  const now = clock.now();
  const [row] = await db
    .insert(outboxJobs)
    .values({
      kind: EMAIL_KIND,
      payload: job,
      dedupeKey: options.dedupeKey,
      runAfter: now,
      createdAt: now,
    })
    .onConflictDoNothing({ target: outboxJobs.dedupeKey })
    .returning({ id: outboxJobs.id });
  return row?.id ?? null;
}

export type DispatchResult = { sent: number; failed: number };

/**
 * Sends due emails. Safe to run from several workers at once: each claims rows with
 * SKIP LOCKED, and a row stays locked until its send is recorded.
 */
export async function dispatchEmails(
  deps: { db: Db; mailer: Mailer; clock: Clock },
  options: { limit?: number; ids?: string[] } = {},
): Promise<DispatchResult> {
  const now = deps.clock.now();
  const result: DispatchResult = { sent: 0, failed: 0 };

  await deps.db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(outboxJobs)
      .where(
        and(
          eq(outboxJobs.kind, EMAIL_KIND),
          eq(outboxJobs.status, "pending"),
          lte(outboxJobs.runAfter, now),
          options.ids ? inArray(outboxJobs.id, options.ids) : undefined,
        ),
      )
      .orderBy(outboxJobs.runAfter)
      .limit(options.limit ?? 20)
      .for("update", { skipLocked: true });

    for (const job of due) {
      const email = job.payload as EmailJob;
      try {
        await deps.mailer.send({ to: email.to, ...renderEmail(email.locale, email) });
        await tx
          .update(outboxJobs)
          .set({ status: "done", processedAt: now, attempts: job.attempts + 1, lastError: null })
          .where(eq(outboxJobs.id, job.id));
        result.sent += 1;
      } catch (error) {
        const attempts = job.attempts + 1;
        const exhausted = attempts >= MAX_EMAIL_ATTEMPTS;
        await tx
          .update(outboxJobs)
          .set({
            attempts,
            status: exhausted ? "failed" : "pending",
            // 1, 2, 4, 8, 16 minutes.
            runAfter: new Date(now.getTime() + 60_000 * 2 ** (attempts - 1)),
            lastError: error instanceof Error ? error.message : String(error),
          })
          .where(eq(outboxJobs.id, job.id));
        result.failed += 1;
      }
    }
  });

  return result;
}

/** Queues an email and tries to send it straight away; a failure is left for the next sweep. */
export async function sendEmailNow(
  deps: { db: Db; mailer: Mailer; clock: Clock },
  job: EmailJob,
): Promise<void> {
  const id = await enqueueEmail(deps.db, deps.clock, job);
  if (id) await dispatchEmails(deps, { ids: [id] });
}

export async function countPendingEmails(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outboxJobs)
    .where(and(eq(outboxJobs.kind, EMAIL_KIND), eq(outboxJobs.status, "pending")));
  return row?.count ?? 0;
}
