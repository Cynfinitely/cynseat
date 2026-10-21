import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    // Per-IP limits on sign-in and sign-up. "off" exists for automated tests only and is
    // refused on a production deployment.
    AUTH_RATE_LIMIT: z
      .enum(["on", "off"])
      .default("on")
      .refine((value) => value === "on" || process.env.VERCEL_ENV !== "production", {
        error: "AUTH_RATE_LIMIT cannot be off in production",
      }),
    // Signs order links and ticket QR codes. Changing it invalidates every one issued.
    SIGNING_SECRET: z.string().min(32),
    // "fake" replaces the payment provider with a local stand-in. Never in production.
    PAYMENTS_DRIVER: z
      .enum(["fake", "stripe"])
      .default("fake")
      .refine((value) => value !== "fake" || process.env.VERCEL_ENV !== "production", {
        error: "PAYMENTS_DRIVER cannot be fake in production",
      }),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
    // Signing secret of the Stripe webhook endpoint that listens to connected accounts.
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    // CynSeat's fee on paid orders: hundredths of a percent, plus minor units per ticket.
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(0),
    PLATFORM_FEE_FIXED_MINOR: z.coerce.number().int().min(0).default(0),
    // Shared counters for rate limiting. Without these, each server instance counts alone.
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    // "off" exists for automated tests only and is refused on a production deployment.
    RATE_LIMIT: z
      .enum(["on", "off"])
      .default("on")
      .refine((value) => value === "on" || process.env.VERCEL_ENV !== "production", {
        error: "RATE_LIMIT cannot be off in production",
      }),
    // How long personal data is kept. Confirm these against your legal obligations.
    RETENTION_PERSONAL_DATA_DAYS: z.coerce.number().int().min(30).default(365),
    RETENTION_SENT_EMAIL_DAYS: z.coerce.number().int().min(1).default(30),
    RETENTION_PAYMENT_EVENT_DAYS: z.coerce.number().int().min(30).default(90),
    // Shared secret for /api/cron/*. Vercel Cron sends it as a bearer token.
    CRON_SECRET: z.string().min(24).optional(),
    // "local" keeps uploaded images on this machine's disk (development only).
    STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("local"),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    // "console" prints emails instead of sending them.
    MAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default("CynSeat <no-reply@localhost>"),
    // Who runs this CynSeat, shown in the privacy policy and terms.
    LEGAL_OPERATOR_NAME: z.string().min(1).optional(),
    LEGAL_COUNTRY: z.string().min(1).optional(),
    LEGAL_CONTACT_EMAIL: z.email().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    // Where errors are reported, from the server and the browser. Unset turns reporting off.
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    AUTH_RATE_LIMIT: process.env.AUTH_RATE_LIMIT,
    SIGNING_SECRET: process.env.SIGNING_SECRET,
    PAYMENTS_DRIVER: process.env.PAYMENTS_DRIVER,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    PLATFORM_FEE_BPS: process.env.PLATFORM_FEE_BPS,
    PLATFORM_FEE_FIXED_MINOR: process.env.PLATFORM_FEE_FIXED_MINOR,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    RATE_LIMIT: process.env.RATE_LIMIT,
    RETENTION_PERSONAL_DATA_DAYS: process.env.RETENTION_PERSONAL_DATA_DAYS,
    RETENTION_SENT_EMAIL_DAYS: process.env.RETENTION_SENT_EMAIL_DAYS,
    RETENTION_PAYMENT_EVENT_DAYS: process.env.RETENTION_PAYMENT_EVENT_DAYS,
    CRON_SECRET: process.env.CRON_SECRET,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    MAIL_DRIVER: process.env.MAIL_DRIVER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    LEGAL_OPERATOR_NAME: process.env.LEGAL_OPERATOR_NAME,
    LEGAL_COUNTRY: process.env.LEGAL_COUNTRY,
    LEGAL_CONTACT_EMAIL: process.env.LEGAL_CONTACT_EMAIL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
