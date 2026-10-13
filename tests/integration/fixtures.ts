import { eq } from "drizzle-orm";
import type { CreateEventInput, TicketTypeInput } from "../../src/domain/events/schemas";
import type { Layout } from "../../src/domain/seatmap/layout";
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
import {
  attachSeatMap,
  createSeatMap,
  getEventSeating,
  saveSeatedTicketType,
  saveSeatMap,
} from "../../src/server/modules/seatmaps/service";
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

/** A small hall: two blocks of seats, 3 rows of 4 each. */
export const hallLayout = (): Layout => ({
  v: 1,
  decor: [],
  sections: [
    {
      kind: "seated",
      key: "stalls",
      name: "Stalls",
      x: 0,
      y: 0,
      rotation: 0,
      rows: 3,
      seatsPerRow: 4,
      rowLabels: "letters",
      seatNumbering: "left",
      seatSpacing: 26,
      rowSpacing: 30,
      curve: 0,
      removed: [],
      accessible: ["0-0"],
    },
    {
      kind: "seated",
      key: "balcony",
      name: "Balcony",
      x: 0,
      y: 200,
      rotation: 0,
      rows: 3,
      seatsPerRow: 4,
      rowLabels: "numbers",
      seatNumbering: "left",
      seatSpacing: 26,
      rowSpacing: 30,
      curve: 0,
      removed: [],
      accessible: [],
    },
  ],
});

/**
 * A published event with reserved seating: 24 seats in two sections, a ticket type per
 * section, and a second, cheaper type in the stalls.
 */
export async function createSeatedEvent(
  app: TestApp,
  org: TestOrg,
  options: { price?: string } = {},
) {
  const ctx = await org.as(org.admin);
  const event = await createEvent(app, ctx, eventInput({ title: unique("Seated Show") }));
  const venue = await createVenue(app, ctx, venueInput());
  await setEventVenue(app, ctx, event.id, { kind: "venue", venueId: venue.id });
  const map = await createSeatMap(app, ctx, { venueId: venue.id, name: "Main hall" });
  await saveSeatMap(app, ctx, map.id, { name: "Main hall", layout: hallLayout() });
  await attachSeatMap(app, ctx, event.id, map.id);

  const seating = (await getEventSeating(app.db, ctx, event.id))!;
  const section = (key: string) => seating.sections.find((candidate) => candidate.key === key)!;
  const price = options.price ?? "20";
  const stalls = await saveSeatedTicketType(app, ctx, event.id, null, {
    name: "Stalls",
    price,
    sectionIds: [section("stalls").id],
  });
  const student = await saveSeatedTicketType(app, ctx, event.id, null, {
    name: "Stalls student",
    price: price === "0" ? "0" : "10",
    sectionIds: [section("stalls").id],
  });
  const balcony = await saveSeatedTicketType(app, ctx, event.id, null, {
    name: "Balcony",
    price: price === "0" ? "0" : "15",
    sectionIds: [section("balcony").id],
  });
  await publishEvent(app, ctx, event.id);

  /** The seat with this key, e.g. "stalls:0-1" (row A, seat 2). */
  const seat = (key: string) => seating.seats.find((candidate) => candidate.key === key)!.id;
  return {
    ...event,
    venue,
    seatMapId: map.id,
    seat,
    types: { stalls: stalls.id, student: student.id, balcony: balcony.id },
    sections: { stalls: section("stalls").id, balcony: section("balcony").id },
  };
}
