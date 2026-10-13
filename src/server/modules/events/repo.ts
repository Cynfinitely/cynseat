import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { events, eventTranslations, organization, orgProfiles, ticketTypes } from "../../db/schema";
import type { DbOrTx } from "../notifications/service";

export type EventRow = typeof events.$inferSelect;
export type TranslationRow = typeof eventTranslations.$inferSelect;
export type TicketTypeRow = typeof ticketTypes.$inferSelect;

// ---- Organization-scoped queries: every one takes the organization id --------------------

const inOrg = (organizationId: string, eventId: string) =>
  and(eq(events.organizationId, organizationId), eq(events.id, eventId));

export async function slugTaken(
  db: DbOrTx,
  organizationId: string,
  slug: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.organizationId, organizationId), eq(events.slug, slug)))
    .limit(1);
  return rows.length > 0;
}

export async function insertEvent(
  db: DbOrTx,
  values: typeof events.$inferInsert,
): Promise<EventRow> {
  const [row] = await db.insert(events).values(values).returning();
  return row!;
}

export async function findEvent(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
  options: { lock?: boolean } = {},
): Promise<EventRow | undefined> {
  const query = db.select().from(events).where(inOrg(organizationId, eventId)).limit(1);
  const [row] = await (options.lock ? query.for("update") : query);
  return row;
}

export async function updateEvent(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
  values: Partial<typeof events.$inferInsert>,
): Promise<void> {
  await db.update(events).set(values).where(inOrg(organizationId, eventId));
}

export async function deleteEvent(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
): Promise<void> {
  await db.delete(events).where(inOrg(organizationId, eventId));
}

export async function findTranslations(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
): Promise<TranslationRow[]> {
  return db
    .select()
    .from(eventTranslations)
    .where(
      and(
        eq(eventTranslations.organizationId, organizationId),
        eq(eventTranslations.eventId, eventId),
      ),
    );
}

export async function upsertTranslation(
  db: DbOrTx,
  values: typeof eventTranslations.$inferInsert,
): Promise<void> {
  await db
    .insert(eventTranslations)
    .values(values)
    .onConflictDoUpdate({
      target: [eventTranslations.eventId, eventTranslations.locale],
      set: {
        title: values.title,
        summary: values.summary,
        description: values.description,
        updatedAt: values.updatedAt,
      },
      // Belt and braces: the conflicting row must belong to the same organization.
      setWhere: eq(eventTranslations.organizationId, values.organizationId),
    });
}

export async function deleteTranslation(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
  locale: string,
): Promise<void> {
  await db
    .delete(eventTranslations)
    .where(
      and(
        eq(eventTranslations.organizationId, organizationId),
        eq(eventTranslations.eventId, eventId),
        eq(eventTranslations.locale, locale),
      ),
    );
}

export async function findTicketTypes(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
): Promise<TicketTypeRow[]> {
  return db
    .select()
    .from(ticketTypes)
    .where(
      and(
        eq(ticketTypes.organizationId, organizationId),
        eq(ticketTypes.eventId, eventId),
        isNull(ticketTypes.archivedAt),
      ),
    )
    .orderBy(asc(ticketTypes.sortOrder), asc(ticketTypes.createdAt));
}

export async function insertTicketType(
  db: DbOrTx,
  values: typeof ticketTypes.$inferInsert,
): Promise<TicketTypeRow> {
  const [row] = await db.insert(ticketTypes).values(values).returning();
  return row!;
}

const ticketTypeInOrg = (organizationId: string, eventId: string, ticketTypeId: string) =>
  and(
    eq(ticketTypes.organizationId, organizationId),
    eq(ticketTypes.eventId, eventId),
    eq(ticketTypes.id, ticketTypeId),
    isNull(ticketTypes.archivedAt),
  );

/**
 * Updates a ticket type. A new capacity is only accepted if it still covers what is sold
 * and held; the check and the write are one statement. Returns false if nothing matched.
 */
export async function updateTicketType(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
  ticketTypeId: string,
  values: Partial<typeof ticketTypes.$inferInsert> & { capacity: number },
): Promise<boolean> {
  const rows = await db
    .update(ticketTypes)
    .set(values)
    .where(
      and(
        ticketTypeInOrg(organizationId, eventId, ticketTypeId),
        sql`${ticketTypes.qtySold} + ${ticketTypes.qtyHeld} <= ${values.capacity}`,
      ),
    )
    .returning({ id: ticketTypes.id });
  return rows.length === 1;
}

export async function findTicketType(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
  ticketTypeId: string,
): Promise<TicketTypeRow | undefined> {
  const [row] = await db
    .select()
    .from(ticketTypes)
    .where(ticketTypeInOrg(organizationId, eventId, ticketTypeId))
    .limit(1);
  return row;
}

/** Deletes a type nobody has bought or is holding. Returns false if it has been used. */
export async function deleteUnusedTicketType(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
  ticketTypeId: string,
): Promise<boolean> {
  const rows = await db
    .delete(ticketTypes)
    .where(
      and(
        ticketTypeInOrg(organizationId, eventId, ticketTypeId),
        eq(ticketTypes.qtySold, 0),
        eq(ticketTypes.qtyHeld, 0),
      ),
    )
    .returning({ id: ticketTypes.id });
  return rows.length === 1;
}

export async function archiveTicketType(
  db: DbOrTx,
  organizationId: string,
  eventId: string,
  ticketTypeId: string,
  at: Date,
): Promise<void> {
  await db
    .update(ticketTypes)
    .set({ archivedAt: at, isActive: false, updatedAt: at })
    .where(ticketTypeInOrg(organizationId, eventId, ticketTypeId));
}

/** An organization's events with their default-language title and ticket totals. */
export async function findOrgEvents(db: DbOrTx, organizationId: string) {
  return db
    .select({
      id: events.id,
      slug: events.slug,
      status: events.status,
      startsAt: events.startsAt,
      timezone: events.timezone,
      title: eventTranslations.title,
      sold: sql<number>`coalesce((select sum(${ticketTypes.qtySold}) from ${ticketTypes}
        where ${ticketTypes.eventId} = ${events.id}), 0)::int`,
      capacity: sql<number>`coalesce((select sum(${ticketTypes.capacity}) from ${ticketTypes}
        where ${ticketTypes.eventId} = ${events.id} and ${ticketTypes.archivedAt} is null), 0)::int`,
    })
    .from(events)
    .leftJoin(
      eventTranslations,
      and(
        eq(eventTranslations.eventId, events.id),
        eq(eventTranslations.locale, events.defaultLocale),
      ),
    )
    .where(eq(events.organizationId, organizationId))
    .orderBy(desc(events.startsAt));
}

// ---- Public queries: published events of approved organizations only ----------------------

const publiclyVisible = and(
  eq(orgProfiles.approvalStatus, "approved"),
  eq(events.status, "published"),
);

const publicColumns = {
  event: events,
  organization: { id: organization.id, slug: organization.slug, name: organization.name },
};

export async function findUpcomingPublicEvents(
  db: DbOrTx,
  options: { now: Date; limit: number; organizationSlug?: string },
) {
  return db
    .select(publicColumns)
    .from(events)
    .innerJoin(organization, eq(organization.id, events.organizationId))
    .innerJoin(orgProfiles, eq(orgProfiles.organizationId, events.organizationId))
    .where(
      and(
        publiclyVisible,
        eq(events.visibility, "public"),
        // Still listed while it is running, when an end time is known.
        gte(sql`coalesce(${events.endsAt}, ${events.startsAt})`, options.now),
        options.organizationSlug ? eq(organization.slug, options.organizationSlug) : undefined,
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(options.limit);
}

/** A published or cancelled event by its public address. Unlisted events are reachable. */
export async function findPublicEvent(db: DbOrTx, organizationSlug: string, eventSlug: string) {
  const [row] = await db
    .select({ ...publicColumns, contactEmail: orgProfiles.contactEmail })
    .from(events)
    .innerJoin(organization, eq(organization.id, events.organizationId))
    .innerJoin(orgProfiles, eq(orgProfiles.organizationId, events.organizationId))
    .where(
      and(
        eq(orgProfiles.approvalStatus, "approved"),
        sql`${events.status} in ('published', 'cancelled')`,
        // A draft that was cancelled before ever being published stays private.
        sql`${events.publishedAt} is not null`,
        eq(organization.slug, organizationSlug),
        eq(events.slug, eventSlug),
      ),
    )
    .limit(1);
  return row;
}

export async function findPublicOrganization(db: DbOrTx, slug: string) {
  const [row] = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      description: orgProfiles.description,
      website: orgProfiles.website,
      contactEmail: orgProfiles.contactEmail,
    })
    .from(organization)
    .innerJoin(orgProfiles, eq(orgProfiles.organizationId, organization.id))
    .where(and(eq(organization.slug, slug), eq(orgProfiles.approvalStatus, "approved")))
    .limit(1);
  return row;
}

/** Translations and public ticket types for a set of events, in two queries. */
export async function findPublicDetails(db: DbOrTx, eventIds: string[]) {
  if (eventIds.length === 0) return { translations: [], ticketTypes: [] };
  const ids = sql.join(
    eventIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const [translations, types] = await Promise.all([
    db
      .select()
      .from(eventTranslations)
      .where(sql`${eventTranslations.eventId} in (${ids})`),
    db
      .select()
      .from(ticketTypes)
      .where(
        and(
          sql`${ticketTypes.eventId} in (${ids})`,
          eq(ticketTypes.isActive, true),
          isNull(ticketTypes.archivedAt),
        ),
      )
      .orderBy(asc(ticketTypes.sortOrder), asc(ticketTypes.createdAt)),
  ]);
  return { translations, ticketTypes: types };
}
