import { eq } from "drizzle-orm";
import type { CreateEventInput, TicketTypeInput } from "../../src/domain/events/schemas";
import type { VenueInput } from "../../src/domain/venues/schemas";
import { orgProfiles } from "../../src/server/db/schema";
import {
  createEvent,
  createTicketType,
  publishEvent,
  setEventVenue,
} from "../../src/server/modules/events/service";
import {
  getOrgContext,
  registerOrganization,
  reviewOrganization,
  type OrgContext,
} from "../../src/server/modules/orgs/service";
import { createVenue } from "../../src/server/modules/venues/service";
import { addMember, createUser, unique, type TestApp, type TestUser } from "./test-app";

export type TestOrg = {
  id: string;
  slug: string;
  name: string;
  admin: TestUser;
  member: TestUser;
  door: TestUser;
  /** Fresh contexts, re-read from the database each time. */
  as(user: TestUser): Promise<OrgContext>;
};

/** An organization with one user in each role, approved and able to take payments by default. */
export async function createOrg(
  app: TestApp,
  options: { approved?: boolean; name?: string; payments?: boolean } = {},
): Promise<TestOrg> {
  const [admin, member, door] = await Promise.all([
    createUser(app),
    createUser(app),
    createUser(app),
  ]);
  const name = options.name ?? "Tiyatro Maydanoz";
  const org = await registerOrganization(app, admin.actor, {
    name,
    slug: unique("org"),
    contactEmail: "info@example.org",
    country: "FI",
  });
  await addMember(app, org.id, member, "member");
  await addMember(app, org.id, door, "door_staff");

  if (options.approved ?? true) {
    const reviewer = await createUser(app, { platformAdmin: true });
    await reviewOrganization(app, reviewer.actor, { organizationId: org.id, decision: "approve" });
  }

  if (options.payments ?? true) {
    // As if the organization had finished connecting its payment account.
    await app.db
      .update(orgProfiles)
      .set({ stripeAccountId: `acct_${unique("test")}`, stripeChargesEnabled: true })
      .where(eq(orgProfiles.organizationId, org.id));
  }

  return {
    ...org,
    name,
    admin,
    member,
    door,
    as: (user) => getOrgContext(app.db, user.actor, org.slug),
  };
}

export const eventInput = (overrides: Partial<CreateEventInput> = {}): CreateEventInput => ({
  title: "Bir Masal Gibi Anlat",
  locale: "tr",
  category: "music",
  timezone: "Europe/Helsinki",
  startsAt: "2030-01-10T18:30",
  ...overrides,
});

export const venueInput = (overrides: Partial<VenueInput> = {}): VenueInput => ({
  name: unique("Martinlaakson Auditorio"),
  addressLine1: "Martinlaaksonpolku 4",
  city: "Vantaa",
  country: "FI",
  timezone: "Europe/Helsinki",
  capacity: 300,
  ...overrides,
});

export const ticketInput = (overrides: Partial<TicketTypeInput> = {}): TicketTypeInput => ({
  name: "Standard",
  price: "5",
  capacity: 300,
  ...overrides,
});

/** A published general-admission event with one venue and one ticket type. */
export async function createPublishedEvent(
  app: TestApp,
  org: TestOrg,
  options: { event?: Partial<CreateEventInput>; ticket?: Partial<TicketTypeInput> } = {},
) {
  const ctx = await org.as(org.admin);
  const event = await createEvent(app, ctx, eventInput(options.event));
  const venue = await createVenue(app, ctx, venueInput());
  await setEventVenue(app, ctx, event.id, { kind: "venue", venueId: venue.id });
  const ticketType = await createTicketType(app, ctx, event.id, ticketInput(options.ticket));
  await publishEvent(app, ctx, event.id);
  return { ...event, venue, ticketTypeId: ticketType.id };
}
