import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createOrg,
  createPublishedEvent,
  eventInput,
  ticketInput,
  venueInput,
} from "../../../../tests/integration/fixtures";
import { codeOf, createUser, setupTestApp } from "../../../../tests/integration/test-app";
import { events, eventTranslations, ticketTypes, venues } from "../../db/schema";
import { reviewOrganization } from "../orgs/service";
import { createVenue, searchVenues, updateVenue } from "../venues/service";
import { getPublicEvent, getPublicOrganization, listUpcomingEvents } from "./public";
import {
  cancelEvent,
  createEvent,
  createTicketType,
  deleteDraftEvent,
  getOrgEvent,
  listOrgEvents,
  publishEvent,
  removeEventCover,
  removeTicketType,
  removeTranslation,
  saveTranslation,
  setEventCover,
  setEventVenue,
  unpublishEvent,
  updateEvent,
  updateTicketType,
} from "./service";

const details = {
  category: "theatre" as const,
  visibility: "public" as const,
  timezone: "Europe/Helsinki",
  startsAt: "2030-01-10T18:30",
  currency: "eur" as const,
  maxTicketsPerOrder: 5,
};

describe("events", () => {
  const getApp = setupTestApp();
  const failure = (fn: () => Promise<unknown>) =>
    fn().then(
      () => null,
      (error: unknown) => error,
    );

  describe("drafting", () => {
    it("creates a draft in the organization's currency with a slug from the title", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.member);

      const first = await createEvent(app, ctx, eventInput());
      const second = await createEvent(app, ctx, eventInput());
      expect(first.slug).toBe("bir-masal-gibi-anlat");
      expect(second.slug).toBe("bir-masal-gibi-anlat-2");

      const { event, translations } = await getOrgEvent(app, ctx, first.id);
      expect(event).toMatchObject({ status: "draft", currency: "eur", defaultLocale: "tr" });
      expect(event.startsAt.toISOString()).toBe("2030-01-10T16:30:00.000Z");
      expect(translations).toEqual([expect.objectContaining({ locale: "tr" })]);
    });

    it("rejects a start time that does not exist in the event's time zone", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const error = await failure(async () =>
        // 03:30 on the night clocks go forward in Helsinki.
        createEvent(app, await org.as(org.admin), eventInput({ startsAt: "2030-03-31T03:30" })),
      );
      expect(error).toMatchObject({ code: "VALIDATION", fields: { startsAt: "invalid_date" } });
    });

    it("checks that end and door times are consistent with the start", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());

      expect(
        await failure(() =>
          updateEvent(app, ctx, event.id, { ...details, endsAt: "2030-01-10T18:00" }),
        ),
      ).toMatchObject({ fields: { endsAt: "ends_before_start" } });
      expect(
        await failure(() =>
          updateEvent(app, ctx, event.id, { ...details, doorsAt: "2030-01-10T19:00" }),
        ),
      ).toMatchObject({ fields: { doorsAt: "doors_after_start" } });

      await updateEvent(app, ctx, event.id, {
        ...details,
        endsAt: "2030-01-10T20:10",
        doorsAt: "2030-01-10T17:45",
      });
      const saved = (await getOrgEvent(app, ctx, event.id)).event;
      expect(saved.endsAt?.toISOString()).toBe("2030-01-10T18:10:00.000Z");
      expect(saved.maxTicketsPerOrder).toBe(5);
    });

    it("keeps content per language and protects the default one", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());

      await saveTranslation(app, ctx, event.id, {
        locale: "en",
        title: "Tell It Like a Fairy Tale",
        summary: "Music and stories",
      });
      await saveTranslation(app, ctx, event.id, { locale: "en", title: "Tell It Like a Tale" });
      const { translations } = await getOrgEvent(app, ctx, event.id);
      expect(translations.find((row) => row.locale === "en")).toMatchObject({
        title: "Tell It Like a Tale",
        summary: null,
      });

      expect(await codeOf(() => removeTranslation(app, ctx, event.id, "tr"))).toBe("CONFLICT");
      await removeTranslation(app, ctx, event.id, "en");
      expect((await getOrgEvent(app, ctx, event.id)).translations).toHaveLength(1);
    });

    it("lets door staff look but not touch", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createEvent(app, await org.as(org.admin), eventInput());
      const door = await org.as(org.door);

      expect(await listOrgEvents(app.db, door)).toHaveLength(1);
      expect(await codeOf(() => createEvent(app, door, eventInput()))).toBe("FORBIDDEN");
      expect(await codeOf(() => updateEvent(app, door, event.id, details))).toBe("FORBIDDEN");
      expect(await codeOf(() => createTicketType(app, door, event.id, ticketInput()))).toBe(
        "FORBIDDEN",
      );
      expect(await codeOf(() => deleteDraftEvent(app, door, event.id))).toBe("FORBIDDEN");
    });
  });

  describe("venues", () => {
    it("shares venues between organizations but lets only the creator edit them", async () => {
      const app = getApp();
      const [a, b] = await Promise.all([createOrg(app), createOrg(app)]);
      const input = venueInput();
      const venue = await createVenue(app, await a.as(a.member), input);

      const found = await searchVenues(app.db, await b.as(b.member), input.name.slice(0, 12));
      expect(found.map((row) => row.id)).toContain(venue.id);

      expect(await codeOf(async () => updateVenue(app, await b.as(b.admin), venue.id, input))).toBe(
        "FORBIDDEN",
      );
      await updateVenue(app, await a.as(a.admin), venue.id, { ...input, capacity: 250 });
      expect(await codeOf(async () => createVenue(app, await a.as(a.door), venueInput()))).toBe(
        "FORBIDDEN",
      );
    });

    it("refuses a second venue with the same name in the same city", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const input = venueInput();
      await createVenue(app, ctx, input);
      const error = await failure(() =>
        createVenue(app, ctx, { ...input, name: input.name.toUpperCase(), addressLine1: "Other" }),
      );
      expect(error).toMatchObject({ code: "CONFLICT", fields: { name: "venue_exists" } });
    });

    it("treats search text literally", async () => {
      const app = getApp();
      const org = await createOrg(app);
      expect(await searchVenues(app.db, await org.as(org.admin), "%_\\")).toEqual([]);
    });

    it("freezes the venue details on a published event", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const published = await createPublishedEvent(app, org);

      await updateVenue(app, ctx, published.venue.id, {
        ...venueInput(),
        name: "Renamed Hall",
        city: "Espoo",
      });

      const { event } = await getOrgEvent(app, ctx, published.id);
      expect(event.venueSnapshot).toMatchObject({ name: published.venue.name, city: "Vantaa" });
    });

    it("can be switched to online or cleared", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());
      const venue = await createVenue(app, ctx, venueInput());

      await setEventVenue(app, ctx, event.id, { kind: "venue", venueId: venue.id });
      await setEventVenue(app, ctx, event.id, { kind: "online" });
      expect((await getOrgEvent(app, ctx, event.id)).event).toMatchObject({
        isOnline: true,
        venueId: null,
        venueSnapshot: null,
      });
      expect(
        await codeOf(() =>
          setEventVenue(app, ctx, event.id, {
            kind: "venue",
            venueId: "00000000-0000-4000-8000-000000000000",
          }),
        ),
      ).toBe("NOT_FOUND");
    });
  });

  describe("posters", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

    it("stores an image, replaces it, and removes it", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.member);
      const event = await createEvent(app, ctx, eventInput());

      const first = await setEventCover(app, ctx, event.id, png);
      expect(first.url).toMatch(new RegExp(`/events/${event.id}/[0-9a-f]{24}\\.png$`));
      expect(app.store.files.get(first.url)?.contentType).toBe("image/png");

      const second = await setEventCover(app, ctx, event.id, jpeg);
      expect(second.url).toMatch(/\.jpg$/);
      expect(app.store.files.has(first.url)).toBe(false);
      expect((await getOrgEvent(app, ctx, event.id)).event.coverImageUrl).toBe(second.url);

      await removeEventCover(app, ctx, event.id);
      expect(app.store.files.has(second.url)).toBe(false);
      expect((await getOrgEvent(app, ctx, event.id)).event.coverImageUrl).toBeNull();
    });

    it("accepts only real images of a sensible size, from people who may edit the event", async () => {
      const app = getApp();
      const [org, other] = await Promise.all([createOrg(app), createOrg(app)]);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());
      const before = app.store.files.size;

      const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
      expect(await failure(() => setEventCover(app, ctx, event.id, svg))).toMatchObject({
        code: "VALIDATION",
        fields: { cover: "image_type" },
      });
      const huge = new Uint8Array(4 * 1024 * 1024 + 1);
      huge.set(png);
      expect(await failure(() => setEventCover(app, ctx, event.id, huge))).toMatchObject({
        fields: { cover: "image_too_large" },
      });
      expect(
        await codeOf(async () => setEventCover(app, await org.as(org.door), event.id, png)),
      ).toBe("FORBIDDEN");
      expect(
        await codeOf(async () => setEventCover(app, await other.as(other.admin), event.id, png)),
      ).toBe("NOT_FOUND");
      expect(app.store.files.size).toBe(before);
    });
  });

  describe("ticket types", () => {
    it("stores prices in minor units however they are typed", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.member);
      const event = await createEvent(app, ctx, eventInput());

      await createTicketType(app, ctx, event.id, ticketInput({ name: "Adult", price: "12,50" }));
      await createTicketType(app, ctx, event.id, ticketInput({ name: "Free", price: "0" }));
      const { ticketTypes: types } = await getOrgEvent(app, ctx, event.id);
      expect(types.map((type) => [type.name, type.priceAmount, type.sortOrder])).toEqual([
        ["Adult", 1250, 0],
        ["Free", 0, 1],
      ]);

      expect(
        await failure(() => createTicketType(app, ctx, event.id, ticketInput({ price: "12.345" }))),
      ).toMatchObject({ code: "VALIDATION", fields: { price: "invalid_price" } });
      expect(
        await failure(() =>
          createTicketType(
            app,
            ctx,
            event.id,
            ticketInput({ salesStartAt: "2030-01-05T10:00", salesEndAt: "2030-01-04T10:00" }),
          ),
        ),
      ).toMatchObject({ fields: { salesEndAt: "ends_before_start" } });
    });

    it("will not lower capacity below what is already sold or held", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());
      const type = await createTicketType(app, ctx, event.id, ticketInput({ capacity: 100 }));
      await app.db
        .update(ticketTypes)
        .set({ qtySold: 40, qtyHeld: 5 })
        .where(eq(ticketTypes.id, type.id));

      expect(
        await failure(() =>
          updateTicketType(app, ctx, event.id, type.id, ticketInput({ capacity: 44 })),
        ),
      ).toMatchObject({ code: "CONFLICT", fields: { capacity: "capacity_below_sold" } });
      await updateTicketType(app, ctx, event.id, type.id, ticketInput({ capacity: 45 }));
    });

    it("cannot be oversold even by a direct database write", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());
      const type = await createTicketType(app, ctx, event.id, ticketInput({ capacity: 10 }));

      await expect(
        app.db
          .update(ticketTypes)
          .set({ qtySold: 8, qtyHeld: 3 })
          .where(eq(ticketTypes.id, type.id)),
      ).rejects.toThrow();
    });

    it("deletes an unused type but keeps one that has sales, hidden", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());
      const unused = await createTicketType(app, ctx, event.id, ticketInput({ name: "Unused" }));
      const used = await createTicketType(app, ctx, event.id, ticketInput({ name: "Used" }));
      await app.db.update(ticketTypes).set({ qtySold: 1 }).where(eq(ticketTypes.id, used.id));

      await removeTicketType(app, ctx, event.id, unused.id);
      await removeTicketType(app, ctx, event.id, used.id);

      expect((await getOrgEvent(app, ctx, event.id)).ticketTypes).toEqual([]);
      const rows = await app.db.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
      expect(rows.map((row) => row.name)).toEqual(["Used"]);
      expect(rows[0]!.archivedAt).not.toBeNull();
    });
  });

  describe("publishing", () => {
    it("lists what is missing and refuses until it is fixed", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());

      expect((await getOrgEvent(app, ctx, event.id)).publishProblems).toEqual([
        "missing_venue",
        "no_ticket_types",
      ]);
      expect(await failure(() => publishEvent(app, ctx, event.id))).toMatchObject({
        code: "CONFLICT",
        reason: "cannot_publish",
        fields: { missing_venue: "missing_venue", no_ticket_types: "no_ticket_types" },
      });

      await setEventVenue(app, ctx, event.id, { kind: "online" });
      await createTicketType(app, ctx, event.id, ticketInput());
      expect((await getOrgEvent(app, ctx, event.id)).publishProblems).toEqual([]);
      await publishEvent(app, ctx, event.id);
      expect((await getOrgEvent(app, ctx, event.id)).event.status).toBe("published");
      expect(await codeOf(() => publishEvent(app, ctx, event.id))).toBe("CONFLICT");
    });

    it("is for admins of approved organizations only", async () => {
      const app = getApp();
      const pending = await createOrg(app, { approved: false });
      const ctx = await pending.as(pending.admin);
      const event = await createEvent(app, ctx, eventInput());
      await setEventVenue(app, ctx, event.id, { kind: "online" });
      await createTicketType(app, ctx, event.id, ticketInput());

      expect(await failure(() => publishEvent(app, ctx, event.id))).toMatchObject({
        fields: { org_not_approved: "org_not_approved" },
      });
      expect(
        await codeOf(async () => publishEvent(app, await pending.as(pending.member), event.id)),
      ).toBe("FORBIDDEN");
    });

    it("refuses an event whose start has passed", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput({ startsAt: "2020-01-10T18:30" }));
      await setEventVenue(app, ctx, event.id, { kind: "online" });
      await createTicketType(app, ctx, event.id, ticketInput());
      expect(await failure(() => publishEvent(app, ctx, event.id))).toMatchObject({
        fields: { starts_in_past: "starts_in_past" },
      });
    });

    it("locks the currency and blocks unpublishing once tickets are sold", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const published = await createPublishedEvent(app, org);

      expect(
        await failure(() => updateEvent(app, ctx, published.id, { ...details, currency: "sek" })),
      ).toMatchObject({ fields: { currency: "currency_locked" } });

      await app.db
        .update(ticketTypes)
        .set({ qtySold: 1 })
        .where(eq(ticketTypes.id, published.ticketTypeId));
      expect(await failure(() => unpublishEvent(app, ctx, published.id))).toMatchObject({
        reason: "has_sales",
      });
    });

    it("can unpublish an unsold event, delete a draft, and cancel a published one", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const published = await createPublishedEvent(app, org);

      await unpublishEvent(app, ctx, published.id);
      // It has been public once, so it is no longer a throwaway draft.
      expect(await codeOf(() => deleteDraftEvent(app, ctx, published.id))).toBe("CONFLICT");
      await publishEvent(app, ctx, published.id);
      await cancelEvent(app, ctx, published.id, "Artist is ill");
      expect((await getOrgEvent(app, ctx, published.id)).event).toMatchObject({
        status: "cancelled",
        cancellationReason: "Artist is ill",
      });
      expect(await codeOf(() => updateEvent(app, ctx, published.id, details))).toBe("CONFLICT");

      const draft = await createEvent(app, ctx, eventInput());
      await deleteDraftEvent(app, ctx, draft.id);
      expect(await codeOf(() => getOrgEvent(app, ctx, draft.id))).toBe("NOT_FOUND");
    });
  });

  describe("tenant isolation", () => {
    it("reports another organization's event as not found from every use-case", async () => {
      const app = getApp();
      const [a, b] = await Promise.all([createOrg(app), createOrg(app)]);
      const target = await createPublishedEvent(app, a);
      const draft = await createEvent(app, await a.as(a.admin), eventInput({ title: "Draft" }));
      const intruder = await b.as(b.admin);
      const before = await getOrgEvent(app, await a.as(a.admin), target.id);

      const attempts: Record<string, () => Promise<unknown>> = {
        getOrgEvent: () => getOrgEvent(app, intruder, target.id),
        updateEvent: () => updateEvent(app, intruder, target.id, details),
        saveTranslation: () =>
          saveTranslation(app, intruder, target.id, { locale: "en", title: "Hacked" }),
        removeTranslation: () => removeTranslation(app, intruder, target.id, "en"),
        setEventVenue: () => setEventVenue(app, intruder, target.id, { kind: "online" }),
        createTicketType: () => createTicketType(app, intruder, target.id, ticketInput()),
        updateTicketType: () =>
          updateTicketType(
            app,
            intruder,
            target.id,
            target.ticketTypeId,
            ticketInput({ price: "0" }),
          ),
        removeTicketType: () => removeTicketType(app, intruder, target.id, target.ticketTypeId),
        publishEvent: () => publishEvent(app, intruder, draft.id),
        unpublishEvent: () => unpublishEvent(app, intruder, target.id),
        cancelEvent: () => cancelEvent(app, intruder, target.id, "mine now"),
        deleteDraftEvent: () => deleteDraftEvent(app, intruder, draft.id),
      };
      for (const [name, attempt] of Object.entries(attempts)) {
        expect(await codeOf(attempt), name).toBe("NOT_FOUND");
      }

      expect(await getOrgEvent(app, await a.as(a.admin), target.id)).toEqual(before);
      expect((await listOrgEvents(app.db, intruder)).map((event) => event.id)).toEqual([]);
    });

    it("will not move a ticket type across events inside one organization", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const first = await createPublishedEvent(app, org);
      const second = await createEvent(app, ctx, eventInput({ title: "Second" }));

      expect(
        await codeOf(() =>
          updateTicketType(app, ctx, second.id, first.ticketTypeId, ticketInput({ price: "0" })),
        ),
      ).toBe("NOT_FOUND");
    });

    it("cannot attach rows to another organization's event even with raw inserts", async () => {
      const app = getApp();
      const [a, b] = await Promise.all([createOrg(app), createOrg(app)]);
      const event = await createEvent(app, await a.as(a.admin), eventInput());

      await expect(
        app.db
          .insert(eventTranslations)
          .values({ eventId: event.id, organizationId: b.id, locale: "en", title: "x" }),
      ).rejects.toThrow();
      await expect(
        app.db.insert(ticketTypes).values({
          eventId: event.id,
          organizationId: b.id,
          name: "x",
          priceAmount: 0,
          capacity: 1,
        }),
      ).rejects.toThrow();
    });
  });

  describe("what the public sees", () => {
    it("shows published events of approved organizations and nothing else", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const published = await createPublishedEvent(app, org, { ticket: { price: "12,50" } });
      const draft = await createEvent(app, ctx, eventInput({ title: "Secret draft" }));
      const pendingOrg = await createOrg(app, { approved: false });
      await createEvent(app, await pendingOrg.as(pendingOrg.admin), eventInput());

      const listed = await listUpcomingEvents(app, { locale: "en", limit: 100 });
      const mine = listed.filter((event) => event.organization.slug === org.slug);
      expect(mine).toEqual([
        expect.objectContaining({
          id: published.id,
          title: "Bir Masal Gibi Anlat",
          contentLocale: "tr",
          fromPrice: 1250,
          venue: expect.objectContaining({ city: "Vantaa" }),
        }),
      ]);
      expect(listed.some((event) => event.organization.slug === pendingOrg.slug)).toBe(false);

      expect(await getPublicEvent(app, org.slug, draft.slug, "en")).toBeNull();
      expect(await getPublicOrganization(app, pendingOrg.slug, "en")).toBeNull();
      expect((await getPublicOrganization(app, org.slug, "en"))?.events).toHaveLength(1);
    });

    it("serves content in the reader's language when the organizer provided it", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const published = await createPublishedEvent(app, org);
      await saveTranslation(app, await org.as(org.admin), published.id, {
        locale: "fi",
        title: "Kerro kuin satu",
        description: "Musiikkia ja tarinoita.",
      });

      expect(await getPublicEvent(app, org.slug, published.slug, "fi")).toMatchObject({
        title: "Kerro kuin satu",
        description: "Musiikkia ja tarinoita.",
        contentLocale: "fi",
      });
      expect(await getPublicEvent(app, org.slug, published.slug, "en")).toMatchObject({
        title: "Bir Masal Gibi Anlat",
        contentLocale: "tr",
      });
    });

    it("keeps unlisted events out of listings but reachable by address", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const published = await createPublishedEvent(app, org);
      await updateEvent(app, await org.as(org.admin), published.id, {
        ...details,
        visibility: "unlisted",
      });

      expect((await getPublicOrganization(app, org.slug, "en"))?.events).toEqual([]);
      expect(await getPublicEvent(app, org.slug, published.slug, "en")).not.toBeNull();
    });

    it("drops events from listings once they are over", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const published = await createPublishedEvent(app, org);
      await app.db
        .update(events)
        .set({ startsAt: new Date(Date.now() - 3 * 3_600_000), endsAt: null })
        .where(eq(events.id, published.id));
      expect((await getPublicOrganization(app, org.slug, "en"))?.events).toEqual([]);

      // Still running: listed until its end time.
      await app.db
        .update(events)
        .set({ endsAt: new Date(Date.now() + 3_600_000) })
        .where(eq(events.id, published.id));
      expect((await getPublicOrganization(app, org.slug, "en"))?.events).toHaveLength(1);
    });

    it("reports ticket availability, and closes sales on cancelled events", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const published = await createPublishedEvent(app, org, { ticket: { capacity: 20 } });
      await createTicketType(
        app,
        ctx,
        published.id,
        ticketInput({ name: "Early", salesStartAt: "2029-12-01T10:00" }),
      );
      await app.db
        .update(ticketTypes)
        .set({ qtySold: 12, qtyHeld: 3 })
        .where(eq(ticketTypes.id, published.ticketTypeId));

      const open = await getPublicEvent(app, org.slug, published.slug, "en");
      expect(open?.ticketTypes).toEqual([
        expect.objectContaining({
          name: "Standard",
          state: "on_sale",
          remaining: 5,
          maxPerOrder: 10,
        }),
        expect.objectContaining({ name: "Early", state: "not_started", remaining: null }),
      ]);

      await app.db
        .update(ticketTypes)
        .set({ qtySold: 20, qtyHeld: 0 })
        .where(eq(ticketTypes.id, published.ticketTypeId));
      expect(
        (await getPublicEvent(app, org.slug, published.slug, "en"))?.ticketTypes[0]?.state,
      ).toBe("sold_out");

      await cancelEvent(app, ctx, published.id, "Storm");
      const cancelled = await getPublicEvent(app, org.slug, published.slug, "en");
      expect(cancelled).toMatchObject({ status: "cancelled", cancellationReason: "Storm" });
      expect(cancelled?.ticketTypes.every((type) => type.state === "ended")).toBe(true);
      expect((await getPublicOrganization(app, org.slug, "en"))?.events).toEqual([]);
    });

    it("hides everything when the organization is suspended", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const published = await createPublishedEvent(app, org);
      const reviewer = await createUser(app, { platformAdmin: true });
      await reviewOrganization(app, reviewer.actor, {
        organizationId: org.id,
        decision: "suspend",
      });

      expect(await getPublicEvent(app, org.slug, published.slug, "en")).toBeNull();
      expect(await getPublicOrganization(app, org.slug, "en")).toBeNull();
      const listed = await listUpcomingEvents(app, { locale: "en", limit: 100 });
      expect(listed.some((event) => event.id === published.id)).toBe(false);
    });
  });

  it("keeps venues out of reach of a hidden status", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const ctx = await org.as(org.admin);
    const venue = await createVenue(app, ctx, venueInput());
    await app.db.update(venues).set({ status: "hidden" }).where(eq(venues.id, venue.id));
    const event = await createEvent(app, ctx, eventInput());

    expect((await searchVenues(app.db, ctx, venue.name)).map((row) => row.id)).not.toContain(
      venue.id,
    );
    expect(
      await codeOf(() => setEventVenue(app, ctx, event.id, { kind: "venue", venueId: venue.id })),
    ).toBe("NOT_FOUND");
  });
});
