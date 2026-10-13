// Config entry for the Better Auth CLI only (`pnpm auth:generate`). Never imported by the app.
import { createDb } from "../db/client";
import { createAuth } from "./auth";

const noop = async (): Promise<void> => {};

export const auth = createAuth({
  db: createDb("postgres://unused:unused@localhost:5432/unused").db,
  baseURL: "http://localhost:3000",
  secret: "cli-only-secret-not-used-at-runtime",
  emails: { sendVerification: noop, sendPasswordReset: noop, sendInvitation: noop },
  onOrganizationCreated: noop,
  onMembershipEvent: noop,
});
