import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  eventCategories,
  eventStatuses,
  eventVisibilities,
  ticketKinds,
  venueStatuses,
} from "../../../domain/events/types";
import { organization, user } from "./auth";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

/** The shared venue directory. Not owned by a tenant: any organization can pick a venue. */
export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    postalCode: text("postal_code"),
    city: text("city").notNull(),
    country: text("country").notNull(),
    timezone: text("timezone").notNull(),
    capacity: integer("capacity"),
    status: text("status", { enum: venueStatuses }).notNull().default("active"),
    mergedIntoId: uuid("merged_into_id"),
    // Only the organization that added a venue (or a platform admin) may edit it.
    createdByOrgId: text("created_by_org_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("venues_status_check", sql`${table.status} in ${inList(venueStatuses)}`),
    check("venues_country_check", sql`${table.country} ~ '^[A-Z]{2}$'`),
    check("venues_capacity_check", sql`${table.capacity} is null or ${table.capacity} > 0`),
    foreignKey({ columns: [table.mergedIntoId], foreignColumns: [table.id] }),
    index("venues_name_idx").on(sql`lower(${table.name})`),
    index("venues_city_idx").on(table.country, sql`lower(${table.city})`),
  ],
);

/** What an event remembers about its venue, so later directory edits cannot change it. */
export type VenueSnapshot = {
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string | null;
  city: string;
  country: string;
};

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    status: text("status", { enum: eventStatuses }).notNull().default("draft"),
    visibility: text("visibility", { enum: eventVisibilities }).notNull().default("public"),
    salesPaused: boolean("sales_paused").notNull().default(false),
    category: text("category", { enum: eventCategories }).notNull().default("other"),
    defaultLocale: text("default_locale").notNull(),
    // IANA zone the event happens in. Times are stored as instants and shown in this zone.
    timezone: text("timezone").notNull(),
    startsAt: timestamptz("starts_at").notNull(),
    endsAt: timestamptz("ends_at"),
    doorsAt: timestamptz("doors_at"),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "restrict" }),
    venueSnapshot: jsonb("venue_snapshot").$type<VenueSnapshot>(),
    isOnline: boolean("is_online").notNull().default(false),
    currency: text("currency").notNull().default("eur"),
    maxTicketsPerOrder: integer("max_tickets_per_order").notNull().default(10),
    coverImageUrl: text("cover_image_url"),
    publishedAt: timestamptz("published_at"),
    cancelledAt: timestamptz("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("events_org_slug_unique").on(table.organizationId, table.slug),
    // Target for composite foreign keys: a child row cannot name another tenant's event.
    unique("events_org_id_unique").on(table.organizationId, table.id),
    check("events_status_check", sql`${table.status} in ${inList(eventStatuses)}`),
    check("events_visibility_check", sql`${table.visibility} in ${inList(eventVisibilities)}`),
    check("events_category_check", sql`${table.category} in ${inList(eventCategories)}`),
    check("events_currency_check", sql`${table.currency} ~ '^[a-z]{3}$'`),
    check("events_ends_check", sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`),
    check(
      "events_doors_check",
      sql`${table.doorsAt} is null or ${table.doorsAt} <= ${table.startsAt}`,
    ),
    check("events_max_per_order_check", sql`${table.maxTicketsPerOrder} between 1 and 50`),
    check(
      "events_published_check",
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
    check("events_place_check", sql`not (${table.isOnline} and ${table.venueId} is not null)`),
    index("events_public_idx")
      .on(table.startsAt)
      .where(sql`${table.status} = 'published' and ${table.visibility} = 'public'`),
    index("events_org_idx").on(table.organizationId, table.startsAt.desc()),
  ],
);

/** Organizer-written content, one row per language. */
export const eventTranslations = pgTable(
  "event_translations",
  {
    eventId: uuid("event_id").notNull(),
    locale: text("locale").notNull(),
    organizationId: text("organization_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    description: text("description"),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.locale] }),
    foreignKey({
      name: "event_translations_event_fk",
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    check("event_translations_locale_check", sql`${table.locale} in ('en', 'fi', 'tr')`),
  ],
);

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    kind: text("kind", { enum: ticketKinds }).notNull().default("ga"),
    name: text("name").notNull(),
    description: text("description"),
    /** Minor units of the event's currency. */
    priceAmount: integer("price_amount").notNull(),
    /** General admission only; seated types are limited by their seats. */
    capacity: integer("capacity"),
    qtyHeld: integer("qty_held").notNull().default(0),
    qtySold: integer("qty_sold").notNull().default(0),
    salesStartAt: timestamptz("sales_start_at"),
    salesEndAt: timestamptz("sales_end_at"),
    maxPerOrder: integer("max_per_order"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamptz("archived_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "ticket_types_event_fk",
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    unique("ticket_types_event_id_unique").on(table.eventId, table.id),
    check("ticket_types_kind_check", sql`${table.kind} in ${inList(ticketKinds)}`),
    check("ticket_types_price_check", sql`${table.priceAmount} >= 0`),
    check(
      "ticket_types_capacity_kind_check",
      sql`(${table.kind} = 'ga') = (${table.capacity} is not null)`,
    ),
    check("ticket_types_counts_check", sql`${table.qtyHeld} >= 0 and ${table.qtySold} >= 0`),
    // The last line of defence against overselling general admission.
    check(
      "ticket_types_no_oversell_check",
      sql`${table.kind} <> 'ga' or ${table.qtyHeld} + ${table.qtySold} <= ${table.capacity}`,
    ),
    check(
      "ticket_types_sales_window_check",
      sql`${table.salesStartAt} is null or ${table.salesEndAt} is null or ${table.salesEndAt} > ${table.salesStartAt}`,
    ),
    check(
      "ticket_types_max_per_order_check",
      sql`${table.maxPerOrder} is null or ${table.maxPerOrder} between 1 and 50`,
    ),
    index("ticket_types_event_idx").on(table.eventId, table.sortOrder),
  ],
);
