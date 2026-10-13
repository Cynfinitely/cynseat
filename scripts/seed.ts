// Fills a development database with a platform admin, an approved organization and a
// published event: pnpm db:seed. Safe to run more than once.
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { NO_FEE } from "../src/domain/orders/fees";
import { createFakePaymentGateway } from "../src/server/adapters/fake/payment-gateway";
import { createApp } from "../src/server/app";
import type { UserActor } from "../src/server/authz/actor";
import { createDb } from "../src/server/db/client";
import { events, organization, orgProfiles, user } from "../src/server/db/schema";
import {
  createEvent,
  createTicketType,
  publishEvent,
  saveTranslation,
  setEventVenue,
} from "../src/server/modules/events/service";
import {
  getOrgContext,
  grantPlatformAdmin,
  registerOrganization,
  reviewOrganization,
} from "../src/server/modules/orgs/service";
import { searchActiveVenues } from "../src/server/modules/venues/repo";
import { createVenue } from "../src/server/modules/venues/service";
import { toZonedInput } from "../src/domain/time/zoned";
import demoEvent from "./seed-data/demo-event.json";

config({ path: ".env.local", quiet: true });

const PASSWORD = "cynseat-demo-password";
const ADMIN_EMAIL = "admin@cynseat.test";
const ORGANIZER_EMAIL = "organizer@cynseat.test";
const ORG_SLUG = "tiyatro-maydanoz";
const VENUE_NAME = "Martinlaakson Auditorio";
const TIME_ZONE = "Europe/Helsinki";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error(
      "The seed creates accounts with a known password; refusing to run in production.",
    );
  }

  const { db, pool } = createDb(url, { max: 2 });
  const app = createApp({
    db,
    // Sign-up emails are of no use here.
    mailer: { send: async () => {} },
    store: {
      put: async () => {
        throw new Error("The seed does not upload files");
      },
      delete: async () => {},
    },
    clock: { now: () => new Date() },
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    authSecret: process.env.BETTER_AUTH_SECRET ?? "seed-only-secret-seed-only-secret-0123",
    authRateLimit: false,
    gateway: createFakePaymentGateway({ payUrl: () => "" }),
    rateLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
    signingSecret: process.env.SIGNING_SECRET ?? "seed-only-signing-secret-0123456789",
    platformFee: NO_FEE,
  });

  async function ensureUser(email: string, name: string): Promise<UserActor> {
    let [row] = await db.select().from(user).where(eq(user.email, email));
    if (!row) {
      await app.auth.api.signUpEmail({ body: { email, name, password: PASSWORD } });
      [row] = await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.email, email))
        .returning();
    }
    return {
      kind: "user",
      userId: row!.id,
      email,
      name,
      emailVerified: true,
      isPlatformAdmin: false,
    };
  }

  try {
    const admin = { ...(await ensureUser(ADMIN_EMAIL, "Platform Admin")), isPlatformAdmin: true };
    await grantPlatformAdmin(db, ADMIN_EMAIL);
    const organizer = await ensureUser(ORGANIZER_EMAIL, "Demo Organizer");

    const [existing] = await db.select().from(organization).where(eq(organization.slug, ORG_SLUG));
    if (!existing) {
      const org = await registerOrganization(app, organizer, {
        name: "Tiyatro Maydanoz",
        slug: ORG_SLUG,
        contactEmail: ORGANIZER_EMAIL,
        country: "FI",
        description: "A community theatre and music association.",
      });
      await reviewOrganization(app, admin, { organizationId: org.id, decision: "approve" });
    }
    // Stands in for a connected payment account, which only the fake payment driver accepts.
    await db
      .update(orgProfiles)
      .set({ stripeAccountId: "acct_demo_seed", stripeChargesEnabled: true })
      .where(
        sql`${orgProfiles.organizationId} = (select id from organization where slug = ${ORG_SLUG})`,
      );
    const ctx = await getOrgContext(db, organizer, ORG_SLUG);

    const [seeded] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.organizationId, ctx.organization.id));
    if (!seeded) {
      // Always two months ahead, so the demo event is on sale whenever the seed is run.
      const start = new Date(Date.now() + 60 * 24 * 3_600_000);
      const startsAt = `${toZonedInput(start, TIME_ZONE).slice(0, 10)}T18:30`;
      const event = await createEvent(app, ctx, {
        title: demoEvent.tr.title,
        locale: "tr",
        category: "music",
        timezone: TIME_ZONE,
        startsAt,
      });
      for (const locale of ["tr", "en", "fi"] as const) {
        await saveTranslation(app, ctx, event.id, { locale, ...demoEvent[locale] });
      }
      const venue =
        (await searchActiveVenues(db, VENUE_NAME, 1))[0] ??
        (await createVenue(app, ctx, {
          name: VENUE_NAME,
          addressLine1: "Martinlaaksonpolku 4",
          postalCode: "01620",
          city: "Vantaa",
          country: "FI",
          timezone: TIME_ZONE,
          capacity: 300,
        }));
      await setEventVenue(app, ctx, event.id, { kind: "venue", venueId: venue.id });
      await createTicketType(app, ctx, event.id, { name: "Standard", price: "5", capacity: 300 });
      await db.update(events).set({ coverImageUrl: "/masal.jpeg" }).where(eq(events.id, event.id));
      await publishEvent(app, ctx, event.id);
    }

    console.log(`Seeded. Sign in with password "${PASSWORD}" as:`);
    console.log(`  ${ADMIN_EMAIL}      platform admin`);
    console.log(`  ${ORGANIZER_EMAIL}  admin of Tiyatro Maydanoz`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
