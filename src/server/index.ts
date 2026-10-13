// The running application, built once per process from the validated environment.
import { env } from "@/lib/env";
import { createConsoleMailer } from "./adapters/fake/mailer";
import { createResendMailer } from "./adapters/resend/mailer";
import { createApp, type App } from "./app";
import { getDb } from "./db/client";
import { checkHealth, type HealthReport } from "./modules/health/service";
import { systemClock } from "./ports/clock";
import type { Mailer } from "./ports/mailer";

const globalForApp = globalThis as unknown as { cynseatApp?: App };

function createMailer(): Mailer {
  if (env.MAIL_DRIVER === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("MAIL_DRIVER=resend needs RESEND_API_KEY");
    return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  return createConsoleMailer();
}

export function getApp(): App {
  globalForApp.cynseatApp ??= createApp({
    db: getDb().db,
    mailer: createMailer(),
    clock: systemClock,
    appUrl: env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""),
    authSecret: env.BETTER_AUTH_SECRET,
    authRateLimit: env.AUTH_RATE_LIMIT === "on",
  });
  return globalForApp.cynseatApp;
}

export function getHealth(): Promise<HealthReport> {
  return checkHealth(getDb().db);
}
