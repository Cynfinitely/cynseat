import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { scanResults } from "../../../domain/checkin/types";
import {
  holdPhases,
  holdStatuses,
  orderStatuses,
  paymentProviders,
  ticketStatuses,
} from "../../../domain/orders/types";
import { user } from "./auth";
import { events, ticketTypes } from "./events";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** Tickets reserved for one buyer while they shop and pay. */
export const holds = pgTable(
  "holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    /** Random id kept in the buyer's cookie; guests have no account. */
    buyerSessionId: text("buyer_session_id").notNull(),
    status: text("status", { enum: holdStatuses }).notNull().default("active"),
    phase: text("phase", { enum: holdPhases }).notNull().default("cart"),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
    releasedAt: timestamptz("released_at"),
  },
  (table) => [
    foreignKey({
      name: "holds_event_fk",
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("restrict"),
    unique("holds_event_id_unique").on(table.eventId, table.id),
    check("holds_status_check", sql`${table.status} in ${inList(holdStatuses)}`),
    check("holds_phase_check", sql`${table.phase} in ${inList(holdPhases)}`),
    // One open cart per buyer per event; also the lock that serializes a buyer's own clicks.
    uniqueIndex("holds_one_active_per_buyer")
      .on(table.eventId, table.buyerSessionId)
      .where(sql`${table.status} = 'active'`),
    index("holds_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const holdItems = pgTable(
  "hold_items",
  {
    holdId: uuid("hold_id").notNull(),
    ticketTypeId: uuid("ticket_type_id").notNull(),
    eventId: uuid("event_id").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.holdId, table.ticketTypeId] }),
    foreignKey({
      name: "hold_items_hold_fk",
      columns: [table.eventId, table.holdId],
      foreignColumns: [holds.eventId, holds.id],
    }).onDelete("cascade"),
    // Same event on both sides: a hold cannot contain another event's ticket type.
    foreignKey({
      name: "hold_items_ticket_type_fk",
      columns: [table.eventId, table.ticketTypeId],
      foreignColumns: [ticketTypes.eventId, ticketTypes.id],
    }).onDelete("restrict"),
    check("hold_items_quantity_check", sql`${table.quantity} > 0`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    /** Short random reference shown to buyers and organizers. */
    publicId: text("public_id").notNull().unique(),
    holdId: uuid("hold_id")
      .unique()
      .references(() => holds.id, { onDelete: "set null" }),
    status: text("status", { enum: orderStatuses }).notNull().default("pending"),
    email: text("email").notNull(),
    buyerName: text("buyer_name").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    locale: text("locale").notNull(),
    currency: text("currency").notNull(),
    totalAmount: integer("total_amount").notNull(),
    applicationFeeAmount: integer("application_fee_amount").notNull().default(0),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    paymentProvider: text("payment_provider", { enum: paymentProviders }).notNull(),
    /** Connected account the money went to, fixed at purchase so refunds find it later. */
    stripeAccountId: text("stripe_account_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    checkoutExpiresAt: timestamptz("checkout_expires_at"),
    paidAt: timestamptz("paid_at"),
    closedAt: timestamptz("closed_at"),
    /** SHA-256 of the secret in the buyer's order link; the secret itself is never stored. */
    accessTokenHash: bytea("access_token_hash").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "orders_event_fk",
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("restrict"),
    unique("orders_org_id_unique").on(table.organizationId, table.id),
    check("orders_status_check", sql`${table.status} in ${inList(orderStatuses)}`),
    check("orders_provider_check", sql`${table.paymentProvider} in ${inList(paymentProviders)}`),
    check("orders_total_check", sql`${table.totalAmount} >= 0`),
    check(
      "orders_fee_check",
      sql`${table.applicationFeeAmount} between 0 and ${table.totalAmount}`,
    ),
    check("orders_refunded_check", sql`${table.refundedAmount} between 0 and ${table.totalAmount}`),
    // Free orders never touch a payment provider, and paid ones always do.
    check(
      "orders_free_check",
      sql`(${table.paymentProvider} = 'none') = (${table.totalAmount} = 0)`,
    ),
    check("orders_paid_check", sql`${table.status} <> 'paid' or ${table.paidAt} is not null`),
    index("orders_event_idx").on(table.organizationId, table.eventId, table.createdAt.desc()),
    index("orders_email_idx").on(sql`lower(${table.email})`),
    index("orders_user_idx").on(table.userId),
    index("orders_pending_idx")
      .on(table.checkoutExpiresAt)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    orderId: uuid("order_id").notNull(),
    eventId: uuid("event_id").notNull(),
    ticketTypeId: uuid("ticket_type_id").notNull(),
    /** Ticket type name at the time of purchase. */
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceAmount: integer("unit_price_amount").notNull(),
    lineTotalAmount: integer("line_total_amount").notNull(),
  },
  (table) => [
    foreignKey({
      name: "order_items_order_fk",
      columns: [table.organizationId, table.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "order_items_ticket_type_fk",
      columns: [table.eventId, table.ticketTypeId],
      foreignColumns: [ticketTypes.eventId, ticketTypes.id],
    }).onDelete("restrict"),
    check("order_items_quantity_check", sql`${table.quantity} > 0`),
    check("order_items_price_check", sql`${table.unitPriceAmount} >= 0`),
    check(
      "order_items_total_check",
      sql`${table.lineTotalAmount} = ${table.unitPriceAmount} * ${table.quantity}`,
    ),
    index("order_items_order_idx").on(table.orderId),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    orderId: uuid("order_id").notNull(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    /** Position within the order line (1..quantity). */
    seq: integer("seq").notNull(),
    ticketTypeId: uuid("ticket_type_id").notNull(),
    status: text("status", { enum: ticketStatuses }).notNull().default("valid"),
    voidReason: text("void_reason"),
    voidedAt: timestamptz("voided_at"),
    /** Raised to invalidate a leaked QR code and issue a new one. */
    tokenVersion: integer("token_version").notNull().default(1),
    checkedInAt: timestamptz("checked_in_at"),
    checkedInBy: text("checked_in_by").references(() => user.id, { onDelete: "set null" }),
    checkInScanId: uuid("check_in_scan_id"),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "tickets_order_fk",
      columns: [table.organizationId, table.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }).onDelete("restrict"),
    // Makes issuing tickets idempotent: the same order line can never produce two sets.
    unique("tickets_item_seq_unique").on(table.orderItemId, table.seq),
    check("tickets_status_check", sql`${table.status} in ${inList(ticketStatuses)}`),
    check("tickets_seq_check", sql`${table.seq} > 0`),
    index("tickets_event_idx").on(table.organizationId, table.eventId, table.status),
    index("tickets_order_idx").on(table.orderId),
  ],
);

/** Every payment-provider notification received, for audit and replay. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    accountId: text("account_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamptz("received_at").notNull(),
    processedAt: timestamptz("processed_at"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    index("payment_events_unprocessed_idx")
      .on(table.receivedAt)
      .where(sql`${table.processedAt} is null`),
  ],
);

/** Every scan attempt at the door, successful or not. Rows are only ever added. */
export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    ticketId: uuid("ticket_id"),
    /** Chosen by the scanning device, so a retried request is recognised as the same scan. */
    scanId: uuid("scan_id").notNull(),
    result: text("result", { enum: scanResults }).notNull(),
    scannedBy: text("scanned_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "check_ins_event_fk",
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("restrict"),
    check("check_ins_result_check", sql`${table.result} in ${inList(scanResults)}`),
    unique("check_ins_scan_unique").on(table.organizationId, table.scanId),
    index("check_ins_event_idx").on(table.eventId, table.createdAt),
    index("check_ins_ticket_idx").on(table.ticketId),
  ],
);

export const refundStatuses = ["pending", "succeeded", "failed"] as const;
export type RefundStatus = (typeof refundStatuses)[number];

export const refundSources = ["organizer", "system"] as const;

/** Money returned to a buyer, in whole or in part. */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    orderId: uuid("order_id").notNull(),
    amount: integer("amount").notNull(),
    /** Why: "requested", "event_cancelled" or "unfulfillable". */
    reason: text("reason").notNull(),
    note: text("note"),
    status: text("status", { enum: refundStatuses }).notNull().default("pending"),
    source: text("source", { enum: refundSources }).notNull(),
    /** Whether the refunded tickets went back on sale. */
    restock: boolean("restock").notNull().default(false),
    /** How many times this refund has been sent to the provider again after failing. */
    retries: integer("retries").notNull().default(0),
    providerRefundId: text("provider_refund_id").unique(),
    failureReason: text("failure_reason"),
    initiatedBy: text("initiated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "refunds_order_fk",
      columns: [table.organizationId, table.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }).onDelete("restrict"),
    check("refunds_amount_check", sql`${table.amount} >= 0`),
    check("refunds_status_check", sql`${table.status} in ${inList(refundStatuses)}`),
    check("refunds_source_check", sql`${table.source} in ${inList(refundSources)}`),
    index("refunds_order_idx").on(table.orderId),
    index("refunds_pending_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const refundTickets = pgTable(
  "refund_tickets",
  {
    refundId: uuid("refund_id")
      .notNull()
      .references(() => refunds.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.refundId, table.ticketId] }),
    // A ticket can be refunded once.
    unique("refund_tickets_ticket_unique").on(table.ticketId),
  ],
);
