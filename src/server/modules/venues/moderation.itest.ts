import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createOrg,
  createPublishedEvent,
  venueInput,
} from "../../../../tests/integration/fixtures";
import { codeOf, createUser, setupTestApp } from "../../../../tests/integration/test-app";
import { events, seatMaps, venues } from "../../db/schema";
import { getPublicEvent } from "../events/public";
import { createSeatMap } from "../seatmaps/service";
import { listVenuesForModeration, mergeVenues, setVenueHidden } from "./moderation";
import { createVenue, searchVenues } from "./service";

describe("venue moderation", () => {
  const getApp = setupTestApp();

  it("is for platform admins only", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const venue = await createVenue(app, await org.as(org.admin), venueInput());
    for (const actor of [org.admin.actor, (await createUser(app)).actor]) {
      expect(await codeOf(() => listVenuesForModeration(app, actor, ""))).toBe("FORBIDDEN");
      expect(await codeOf(() => setVenueHidden(app, actor, venue.id, true))).toBe("FORBIDDEN");
      expect(
        await codeOf(() => mergeVenues(app, actor, { duplicateId: venue.id, keepId: venue.id })),
      ).toBe("FORBIDDEN");
    }
  });

  it("hides a venue from the directory and can bring it back", async () => {
    const app = getApp();
    const admin = await createUser(app, { platformAdmin: true });
    const org = await createOrg(app);
    const ctx = await org.as(org.admin);
    const venue = await createVenue(app, ctx, venueInput());

    await setVenueHidden(app, admin.actor, venue.id, true);
    expect((await searchVenues(app.db, ctx, venue.name)).map((row) => row.id)).not.toContain(
      venue.id,
    );
    expect(await codeOf(() => setVenueHidden(app, admin.actor, venue.id, true))).toBe("CONFLICT");
    const listed = await listVenuesForModeration(app, admin.actor, venue.name);
    expect(listed[0]).toMatchObject({
      id: venue.id,
      status: "hidden",
      createdByOrganization: org.name,
    });

    await setVenueHidden(app, admin.actor, venue.id, false);
    expect((await searchVenues(app.db, ctx, venue.name)).map((row) => row.id)).toContain(venue.id);
  });

  it("merges a duplicate, moving its events and seat maps but not what buyers were told", async () => {
    const app = getApp();
    const admin = await createUser(app, { platformAdmin: true });
    const org = await createOrg(app);
    const ctx = await org.as(org.admin);
    const published = await createPublishedEvent(app, org);
    const keep = await createVenue(
      app,
      ctx,
      venueInput({ name: "Martinlaakso Hall", city: "Vantaa" }),
    );
    const map = await createSeatMap(app, ctx, { venueId: published.venue.id, name: "Plan" });

    expect(
      await mergeVenues(app, admin.actor, { duplicateId: published.venue.id, keepId: keep.id }),
    ).toEqual({
      events: 1,
      seatMaps: 1,
    });

    const [event] = await app.db.select().from(events).where(eq(events.id, published.id));
    expect(event!.venueId).toBe(keep.id);
    const [plan] = await app.db.select().from(seatMaps).where(eq(seatMaps.id, map.id));
    expect(plan!.venueId).toBe(keep.id);
    const [gone] = await app.db.select().from(venues).where(eq(venues.id, published.venue.id));
    expect(gone).toMatchObject({ status: "merged", mergedIntoId: keep.id });
    // The public page still shows the address the event was published with.
    const shown = await getPublicEvent(app, org.slug, published.slug, "en");
    expect(shown?.venue?.name).toBe(published.venue.name);

    expect(
      await codeOf(() =>
        mergeVenues(app, admin.actor, { duplicateId: published.venue.id, keepId: keep.id }),
      ),
    ).toBe("CONFLICT");
    expect(
      await codeOf(() => mergeVenues(app, admin.actor, { duplicateId: keep.id, keepId: keep.id })),
    ).toBe("CONFLICT");
  });
});
