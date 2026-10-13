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
import type { Layout } from "../../../domain/seatmap/layout";
import { organization, user } from "./auth";
import { events, ticketTypes, venues } from "./events";
import { holds } from "./orders";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const seatStatuses = ["available", "held", "sold", "blocked"] as const;
export type SeatStatus = (typeof seatStatuses)[number];

/**
 * A seating plan an organization drew for a venue. It is a template: events copy it, so
 * editing or deleting a map never touches an event that is already using it.
 */
export const seatMaps = pgTable(
  "seat_maps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    layout: jsonb("layout").$type<Layout>().notNull(),
    seatCount: integer("seat_count").notNull().default(0),
    archivedAt: timestamptz("archived_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    unique("seat_maps_org_id_unique").on(table.organizationId, table.id),
    check("seat_maps_seat_count_check", sql`${table.seatCount} between 0 and 5000`),
    index("seat_maps_org_venue_idx").on(table.organizationId, table.venueId),
  ],
);

/** The copy of a seat map that one event sells from. Geometry only; seat state is in rows. */
export const eventSeatMaps = pgTable(
  "event_seat_maps",
  {
    eventId: uuid("event_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    layout: jsonb("layout").$type<Layout>().notNull(),
    sourceSeatMapId: uuid("source_seat_map_id").references(() => seatMaps.id, {
      onDelete: "set null",
    }),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "event_seat_maps_event_fk",
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
  ],
);

export const eventSections = pgTable(
  "event_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    sectionKey: text("section_key").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    foreignKey({
      name: "event_sections_event_fk",
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    unique("event_sections_key_unique").on(table.eventId, table.sectionKey),
    unique("event_sections_event_id_unique").on(table.eventId, table.id),
  ],
);

/** One row per seat of an event: the unit that is locked, held and sold. */
export const eventSeats = pgTable(
  "event_seats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    eventSectionId: uuid("event_section_id").notNull(),
    /** Matches the seat's key in the layout, e.g. "stalls:3-12". */
    seatKey: text("seat_key").notNull(),
    rowLabel: text("row_label").notNull(),
    seatLabel: text("seat_label").notNull(),
    accessible: boolean("accessible").notNull().default(false),
    status: text("status", { enum: seatStatuses }).notNull().default("available"),
    holdId: uuid("hold_id").references(() => holds.id, { onDelete: "set null" }),
    /** The ticket type the buyer chose for this seat while it is held. */
    heldTicketTypeId: uuid("held_ticket_type_id"),
  },
  (table) => [
    foreignKey({
      name: "event_seats_section_fk",
      columns: [table.eventId, table.eventSectionId],
      foreignColumns: [eventSections.eventId, eventSections.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_seats_event_fk",
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_seats_held_type_fk",
      columns: [table.eventId, table.heldTicketTypeId],
      foreignColumns: [ticketTypes.eventId, ticketTypes.id],
    }),
    unique("event_seats_key_unique").on(table.eventId, table.seatKey),
    unique("event_seats_event_id_unique").on(table.eventId, table.id),
    check(
      "event_seats_status_check",
      sql`${table.status} in ('available', 'held', 'sold', 'blocked')`,
    ),
    // A seat is held exactly when it belongs to a hold.
    check(
      "event_seats_hold_check",
      sql`(${table.status} = 'held') = (${table.holdId} is not null)`,
    ),
    index("event_seats_event_status_idx").on(table.eventId, table.status),
    index("event_seats_hold_idx")
      .on(table.holdId)
      .where(sql`${table.holdId} is not null`),
  ],
);

/** Which sections a seated ticket type is sold for. A section can have several types. */
export const ticketTypeSections = pgTable(
  "ticket_type_sections",
  {
    ticketTypeId: uuid("ticket_type_id").notNull(),
    eventSectionId: uuid("event_section_id").notNull(),
    eventId: uuid("event_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ticketTypeId, table.eventSectionId] }),
    // Both sides carry the event id, so a type can only price sections of its own event.
    foreignKey({
      name: "ticket_type_sections_type_fk",
      columns: [table.eventId, table.ticketTypeId],
      foreignColumns: [ticketTypes.eventId, ticketTypes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "ticket_type_sections_section_fk",
      columns: [table.eventId, table.eventSectionId],
      foreignColumns: [eventSections.eventId, eventSections.id],
    }).onDelete("cascade"),
  ],
);
