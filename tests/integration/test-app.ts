import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createMemoryMailer } from "../../src/server/adapters/fake/mailer";
import { createApp, type App } from "../../src/server/app";
import type { OrgRole } from "../../src/server/auth/roles";
import type { UserActor } from "../../src/server/authz/actor";
import { user } from "../../src/server/db/schema";
import { grantPlatformAdmin } from "../../src/server/modules/orgs/service";
import { useTestDb } from "./test-db";

export const TEST_APP_URL = "http://localhost:3000";
const PASSWORD = "correct-horse-battery";

export type TestClock = { now(): Date; advance(ms: number): void };

export type TestApp = App & {
  mailer: ReturnType<typeof createMemoryMailer>;
  clock: TestClock;
};

/** A fully wired application on this test file's own database. */
export function useTestApp(): () => TestApp {
  const getDb = useTestDb();
  let app: TestApp | undefined;

  return () => {
    if (!app) {
      let offset = 0;
      const clock: TestClock = {
        now: () => new Date(Date.now() + offset),
        advance(ms) {
          offset += ms;
        },
      };
      const mailer = createMemoryMailer();
      app = {
        ...createApp({
          db: getDb().db,
          mailer,
          clock,
          appUrl: TEST_APP_URL,
          authSecret: "test-secret-test-secret-test-secret-0123",
        }),
        mailer,
        clock,
      };
    }
    return app;
  };
}

export const unique = (prefix: string): string => `${prefix}-${randomBytes(4).toString("hex")}`;

export type TestUser = { actor: UserActor; headers: Headers };

/** Signs a user up through the real auth API and returns an actor plus session headers. */
export async function createUser(
  app: TestApp,
  options: { email?: string; name?: string; verified?: boolean; platformAdmin?: boolean } = {},
): Promise<TestUser> {
  const email = options.email ?? `${unique("user")}@example.com`;
  const name = options.name ?? "Test User";
  const verified = options.verified ?? true;

  const signedUp = await app.auth.api.signUpEmail({ body: { email, name, password: PASSWORD } });
  let headers = new Headers();
  if (verified) {
    await app.db.update(user).set({ emailVerified: true }).where(eq(user.id, signedUp.user.id));
    const signIn = await app.auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    const cookies = signIn.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
    headers = new Headers({ cookie: cookies.join("; ") });
  }
  if (options.platformAdmin) await grantPlatformAdmin(app.db, email);

  return {
    headers,
    actor: {
      kind: "user",
      userId: signedUp.user.id,
      email,
      name,
      emailVerified: verified,
      isPlatformAdmin: options.platformAdmin ?? false,
    },
  };
}

export async function addMember(
  app: TestApp,
  organizationId: string,
  member: TestUser,
  role: OrgRole,
): Promise<void> {
  await app.auth.api.addMember({ body: { organizationId, userId: member.actor.userId, role } });
}

/** Runs `fn` and returns the AppError code it threw, or "none". */
export async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "none";
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) return String(error.code);
    throw error;
  }
}
