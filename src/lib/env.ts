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
    // Shared secret for /api/cron/*. Vercel Cron sends it as a bearer token.
    CRON_SECRET: z.string().min(24).optional(),
    // "local" keeps uploaded images on this machine's disk (development only).
    STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("local"),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    // "console" prints emails instead of sending them.
    MAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default("CynSeat <no-reply@localhost>"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    AUTH_RATE_LIMIT: process.env.AUTH_RATE_LIMIT,
    CRON_SECRET: process.env.CRON_SECRET,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    MAIL_DRIVER: process.env.MAIL_DRIVER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
