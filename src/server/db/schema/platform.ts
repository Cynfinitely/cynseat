import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const approvalStatuses = ["pending", "approved", "rejected", "suspended"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

/**
 * CynSeat's own facts about an organization. Kept apart from Better Auth's `organization`
 * table so that none of its client-callable endpoints can touch the approval status.
 */
export const orgProfiles = pgTable(
  "org_profiles",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "restrict" }),
    approvalStatus: text("approval_status", { enum: approvalStatuses })
      .notNull()
      .default("pending"),
    approvalNote: text("approval_note"),
    reviewedAt: timestamptz("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    legalName: text("legal_name"),
    businessId: text("business_id"),
    country: text("country"),
    contactEmail: text("contact_email"),
    website: text("website"),
    description: text("description"),
    defaultCurrency: text("default_currency").notNull().default("eur"),
    defaultLocale: text("default_locale").notNull().default("en"),
    defaultTimezone: text("default_timezone").notNull().default("Europe/Helsinki"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "org_profiles_approval_status_check",
      sql`${table.approvalStatus} in ('pending', 'approved', 'rejected', 'suspended')`,
    ),
    check(
      "org_profiles_reviewed_check",
      sql`${table.approvalStatus} = 'pending' or ${table.reviewedAt} is not null`,
    ),
    check("org_profiles_country_check", sql`${table.country} ~ '^[A-Z]{2}$'`),
    check("org_profiles_currency_check", sql`${table.defaultCurrency} ~ '^[a-z]{3}$'`),
    index("org_profiles_status_idx").on(table.approvalStatus, table.createdAt),
  ],
);

export const platformAdmins = pgTable("platform_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

/** Append-only record of sensitive actions, written in the same transaction as the change. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // No foreign keys: the log must outlive the rows it describes.
    organizationId: text("organization_id"),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_org_idx").on(table.organizationId, table.createdAt.desc()),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const outboxStatuses = ["pending", "done", "failed"] as const;

/** Work to do after a transaction commits (emails now; refunds and reconciliation later). */
export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    dedupeKey: text("dedupe_key"),
    status: text("status", { enum: outboxStatuses }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamptz("run_after").notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    processedAt: timestamptz("processed_at"),
  },
  (table) => [
    check("outbox_jobs_status_check", sql`${table.status} in ('pending', 'done', 'failed')`),
    uniqueIndex("outbox_jobs_dedupe_key_idx").on(table.dedupeKey),
    index("outbox_jobs_due_idx")
      .on(table.runAfter)
      .where(sql`${table.status} = 'pending'`),
  ],
);
