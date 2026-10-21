import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTestApp } from "../../../../tests/integration/test-app";
import { outboxJobs } from "../../db/schema";
import {
  countPendingEmails,
  dispatchEmails,
  enqueueEmail,
  MAX_EMAIL_ATTEMPTS,
  type EmailJob,
} from "./service";

const job = (to: string): EmailJob => ({
  to,
  locale: "en",
  template: "verifyEmail",
  data: { name: "Aino", url: "https://x.test/verify" },
});

describe("email outbox", () => {
  const getApp = setupTestApp();
  const getJob = async (id: string) => {
    const [row] = await getApp().db.select().from(outboxJobs).where(eq(outboxJobs.id, id));
    return row!;
  };

  it("sends a queued email once and marks it done", async () => {
    const app = getApp();
    const id = await enqueueEmail(app.db, app.clock, job("one@example.com"));

    expect(await dispatchEmails(app, { ids: [id!] })).toEqual({ sent: 1, failed: 0 });
    expect(await dispatchEmails(app, { ids: [id!] })).toEqual({ sent: 0, failed: 0 });

    const sent = app.mailer.sent.filter((mail) => mail.to === "one@example.com");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("Confirm your email address");
    expect((await getJob(id!)).status).toBe("done");
  });

  it("ignores a second job with the same dedupe key", async () => {
    const app = getApp();
    const first = await enqueueEmail(app.db, app.clock, job("dedupe@example.com"), {
      dedupeKey: "k1",
    });
    const second = await enqueueEmail(app.db, app.clock, job("dedupe@example.com"), {
      dedupeKey: "k1",
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("does not queue an email when its transaction rolls back", async () => {
    const app = getApp();
    const before = await countPendingEmails(app.db);
    await expect(
      app.db.transaction(async (tx) => {
        await enqueueEmail(tx, app.clock, job("rollback@example.com"));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await countPendingEmails(app.db)).toBe(before);
  });

  it("retries a failed send with backoff and gives up after the limit", async () => {
    const app = getApp();
    const id = await enqueueEmail(app.db, app.clock, job("retry@example.com"));

    app.mailer.failNext(new Error("smtp down"));
    expect(await dispatchEmails(app, { ids: [id!] })).toEqual({ sent: 0, failed: 1 });
    let row = await getJob(id!);
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: "smtp down" });

    // Not due yet.
    expect(await dispatchEmails(app, { ids: [id!] })).toEqual({ sent: 0, failed: 0 });

    for (let attempt = 2; attempt <= MAX_EMAIL_ATTEMPTS; attempt += 1) {
      app.clock.advance(60 * 60_000);
      app.mailer.failNext(new Error("still down"));
      await dispatchEmails(app, { ids: [id!] });
    }
    row = await getJob(id!);
    expect(row).toMatchObject({ status: "failed", attempts: MAX_EMAIL_ATTEMPTS });

    app.clock.advance(24 * 60 * 60_000);
    expect(await dispatchEmails(app, { ids: [id!] })).toEqual({ sent: 0, failed: 0 });
    expect(app.mailer.sent.some((mail) => mail.to === "retry@example.com")).toBe(false);
  });

  it("sends each email exactly once when workers overlap", async () => {
    const app = getApp();
    const ids: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      ids.push((await enqueueEmail(app.db, app.clock, job(`worker-${i}@example.com`)))!);
    }

    const results = await Promise.all(
      Array.from({ length: 5 }, () => dispatchEmails(app, { ids, limit: 30 })),
    );

    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(30);
    const recipients = app.mailer.sent
      .map((mail) => mail.to)
      .filter((to) => to.startsWith("worker-"));
    expect(recipients).toHaveLength(30);
    expect(new Set(recipients).size).toBe(30);
  });
});
