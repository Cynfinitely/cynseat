import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
export const CRON_SECRET = "e2e-only-cron-secret-0123456789";
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://cynseat:cynseat@localhost:5433/cynseat";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Tests run against a production build with the database from `pnpm db:up`.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      BETTER_AUTH_SECRET: "e2e-only-secret-e2e-only-secret-0123456789",
      // The journeys sign several users up from one address within seconds.
      AUTH_RATE_LIMIT: "off",
      MAIL_DRIVER: "console",
      SIGNING_SECRET: "e2e-only-signing-secret-0123456789abcdef",
      PAYMENTS_DRIVER: "fake",
      CRON_SECRET,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://cynseat:cynseat@localhost:5433/cynseat",
    },
  },
});
