// The running application, built once per process from the validated environment.
import { env } from "@/lib/env";
import { createConsoleMailer } from "./adapters/fake/mailer";
import { createFakePaymentGateway, type FakePaymentGateway } from "./adapters/fake/payment-gateway";
import { createLocalObjectStore, type LocalObjectStore } from "./adapters/local/object-store";
import { createResendMailer } from "./adapters/resend/mailer";
import { createVercelBlobStore } from "./adapters/vercel/object-store";
import { createApp, type App } from "./app";
import { getDb } from "./db/client";
import { checkHealth, type HealthReport } from "./modules/health/service";
import { systemClock } from "./ports/clock";
import type { Mailer } from "./ports/mailer";
import type { ObjectStore } from "./ports/object-store";

const globalForApp = globalThis as unknown as { cynseatApp?: App };

function createMailer(): Mailer {
  if (env.MAIL_DRIVER === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("MAIL_DRIVER=resend needs RESEND_API_KEY");
    return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  return createConsoleMailer();
}

const appUrl = () => env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

/** The on-disk store, when that is the configured driver; the upload route reads from it. */
export function getLocalStore(): LocalObjectStore | null {
  if (env.STORAGE_DRIVER !== "local") return null;
  return createLocalObjectStore({ directory: ".data/uploads", baseUrl: appUrl() });
}

function createStore(): ObjectStore {
  const local = getLocalStore();
  if (local) return local;
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("STORAGE_DRIVER=vercel-blob needs BLOB_READ_WRITE_TOKEN");
  }
  return createVercelBlobStore({ token: env.BLOB_READ_WRITE_TOKEN });
}

const globalForGateway = globalThis as unknown as { cynseatFakeGateway?: FakePaymentGateway };

/**
 * The stand-in payment provider, when that is the configured driver. Its "payment page"
 * is a page of this app, which needs to reach it.
 */
export function getFakeGateway(): FakePaymentGateway | null {
  if (env.PAYMENTS_DRIVER !== "fake") return null;
  globalForGateway.cynseatFakeGateway ??= createFakePaymentGateway({
    payUrl: (sessionId) => `${appUrl()}/en/dev/pay/${sessionId}`,
  });
  return globalForGateway.cynseatFakeGateway;
}

function createGateway() {
  const fake = getFakeGateway();
  if (fake) return fake;
  throw new Error("PAYMENTS_DRIVER=stripe is not available yet");
}

export function getApp(): App {
  globalForApp.cynseatApp ??= createApp({
    db: getDb().db,
    mailer: createMailer(),
    store: createStore(),
    clock: systemClock,
    appUrl: appUrl(),
    authSecret: env.BETTER_AUTH_SECRET,
    authRateLimit: env.AUTH_RATE_LIMIT === "on",
    gateway: createGateway(),
    signingSecret: env.SIGNING_SECRET,
    platformFee: { bps: env.PLATFORM_FEE_BPS, fixedMinor: env.PLATFORM_FEE_FIXED_MINOR },
  });
  return globalForApp.cynseatApp;
}

export function getHealth(): Promise<HealthReport> {
  return checkHealth(getDb().db);
}
