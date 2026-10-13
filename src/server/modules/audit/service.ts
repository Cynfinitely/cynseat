import { auditLog } from "../../db/schema";
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
