import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { checkIns, events, orders, outboxJobs, paymentEvents } from "../../db/schema";
import type { Clock } from "../../ports/clock";
import { recordAudit } from "../audit/service";

type Deps = { db: Db; clock: Clock };

export type RetentionPolicy = {
  /** Days after an event ends before its buyers' names and emails are removed. */
  personalDataDays: number;
  /** Days before sent emails are cleared from the outbox (they contain order links). */
  sentEmailDays: number;
  /** Days before raw payment-provider notifications are cleared (they contain emails). */
  paymentEventDays: number;
};

const DAY = 86_400_000;
export const ANONYMIZED_EMAIL = "removed@anonymized.invalid";

/**
 * Removes personal data that is no longer needed. Orders keep their amounts, references
 * and tickets, which bookkeeping needs; only who bought them is erased. Safe to run often:
 * each pass handles a batch and already-anonymized rows are skipped.
 */
export async function applyRetention(
  deps: Deps,
  policy: RetentionPolicy,
  options: { batch?: number } = {},
): Promise<{ orders: number; emails: number; paymentEvents: number }> {
  const now = deps.clock.now().getTime();
  const batch = options.batch ?? 500;
  const endedBefore = new Date(now - policy.personalDataDays * DAY);

  const due = await deps.db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .where(
      and(
        lte(sql`coalesce(${events.endsAt}, ${events.startsAt})`, endedBefore),
        sql`${orders.email} <> ${ANONYMIZED_EMAIL}`,
      ),
    )
    .limit(batch);

  if (due.length > 0) {
    const ids = due.map((row) => row.id);
    await deps.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          email: ANONYMIZED_EMAIL,
          buyerName: "",
          // The account link goes too: the order no longer belongs to anyone we can name.
          userId: null,
          updatedAt: new Date(now),
        })
        .where(inArray(orders.id, ids));
      // Who scanned which ticket says nothing about buyers, but is no longer needed either.
      await tx
        .update(checkIns)
        .set({ scannedBy: null })
        .where(
          sql`${checkIns.ticketId} in (select id from tickets where order_id in (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}))`,
        );
      await recordAudit(tx, {
        action: "privacy.orders_anonymized",
        entityType: "orders",
        entityId: "batch",
        data: { count: ids.length },
      });
    });
  }

  const emails = await deps.db
    .delete(outboxJobs)
    .where(
      and(
        eq(outboxJobs.status, "done"),
        lte(outboxJobs.processedAt, new Date(now - policy.sentEmailDays * DAY)),
      ),
    )
    .returning({ id: outboxJobs.id });

  const notifications = await deps.db
    .delete(paymentEvents)
    .where(
      and(
        lte(paymentEvents.receivedAt, new Date(now - policy.paymentEventDays * DAY)),
        // Unprocessed ones are kept for investigation whatever their age.
        sql`${paymentEvents.processedAt} is not null`,
      ),
    )
    .returning({ id: paymentEvents.id });

  return { orders: due.length, emails: emails.length, paymentEvents: notifications.length };
}
