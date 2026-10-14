import { desc, eq } from "drizzle-orm";
import type { Actor } from "../../authz/actor";
import { authorizePlatform } from "../../authz/authorize";
import type { Db } from "../../db/client";
import { auditLog, organization, user } from "../../db/schema";
import type { DbOrTx } from "../notifications/service";

export type AuditEntry = {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
};

/** Pass the open transaction so the entry commits or rolls back with the change it records. */
export async function recordAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    organizationId: entry.organizationId ?? null,
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    data: entry.data ?? {},
  });
}

export type AuditView = {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  actorEmail: string | null;
  organizationName: string | null;
};

/** The newest entries across the platform, for platform admins. */
export async function listAuditLog(
  db: Db,
  actor: Actor,
  options: { limit?: number } = {},
): Promise<AuditView[]> {
  authorizePlatform(actor, "platform.audit.view");
  return db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      data: auditLog.data,
      actorEmail: user.email,
      organizationName: organization.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .leftJoin(organization, eq(organization.id, auditLog.organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(options.limit ?? 200);
}
