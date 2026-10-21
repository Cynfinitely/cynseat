import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  invitation,
  member,
  organization,
  orgProfiles,
  platformAdmins,
  user,
  type ApprovalStatus,
} from "../../db/schema";
import type { DbOrTx } from "../notifications/service";

export type OrgProfile = typeof orgProfiles.$inferSelect;

const orgColumns = {
  id: organization.id,
  slug: organization.slug,
  name: organization.name,
  createdAt: organization.createdAt,
};

export async function isPlatformAdmin(db: DbOrTx, userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: platformAdmins.userId })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, userId))
    .limit(1);
  return rows.length > 0;
}

export async function slugExists(db: DbOrTx, slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export async function countMemberships(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(member)
    .where(eq(member.userId, userId));
  return row?.count ?? 0;
}

export async function insertProfileIfMissing(db: DbOrTx, organizationId: string): Promise<void> {
  await db.insert(orgProfiles).values({ organizationId }).onConflictDoNothing();
}

export async function updateProfile(
  db: DbOrTx,
  organizationId: string,
  values: Partial<typeof orgProfiles.$inferInsert>,
): Promise<void> {
  await db
    .update(orgProfiles)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(orgProfiles.organizationId, organizationId));
}

/** Organizations the user belongs to, with their role in each. */
export async function findOrganizationsOfUser(db: DbOrTx, userId: string) {
  return db
    .select({
      ...orgColumns,
      role: member.role,
      approvalStatus: orgProfiles.approvalStatus,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(orgProfiles, eq(orgProfiles.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(organization.name);
}

/** The organization with this slug, but only if the user is a member of it. */
export async function findMembershipBySlug(db: DbOrTx, userId: string, slug: string) {
  const [row] = await db
    .select({ ...orgColumns, role: member.role, profile: orgProfiles })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(orgProfiles, eq(orgProfiles.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(organization.slug, slug)))
    .limit(1);
  return row;
}

export async function findMembers(db: DbOrTx, organizationId: string) {
  return db
    .select({
      memberId: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(member.createdAt);
}

export async function findPendingInvitations(db: DbOrTx, organizationId: string, now: Date) {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .orderBy(invitation.createdAt);
}

export async function findAdminRecipients(db: DbOrTx, organizationId: string) {
  return db
    .select({ email: user.email, name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), eq(member.role, "admin")));
}

export async function findOrganizationsByStatus(db: DbOrTx, statuses: ApprovalStatus[]) {
  return db
    .select({ ...orgColumns, profile: orgProfiles })
    .from(orgProfiles)
    .innerJoin(organization, eq(organization.id, orgProfiles.organizationId))
    .where(inArray(orgProfiles.approvalStatus, statuses))
    .orderBy(desc(orgProfiles.createdAt));
}

export async function findOrganizationById(db: DbOrTx, organizationId: string) {
  const [row] = await db
    .select({ ...orgColumns, profile: orgProfiles })
    .from(orgProfiles)
    .innerJoin(organization, eq(organization.id, orgProfiles.organizationId))
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row;
}

/**
 * Moves the organization to `to` only if it is currently in one of `from`.
 * The guard and the write are one statement, so concurrent reviews cannot both win.
 */
export async function transitionApproval(
  db: DbOrTx,
  input: {
    organizationId: string;
    from: ApprovalStatus[];
    to: ApprovalStatus;
    note: string | null;
    reviewedBy: string;
    at: Date;
  },
): Promise<boolean> {
  const rows = await db
    .update(orgProfiles)
    .set({
      approvalStatus: input.to,
      approvalNote: input.note,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.at,
      updatedAt: input.at,
    })
    .where(
      and(
        eq(orgProfiles.organizationId, input.organizationId),
        inArray(orgProfiles.approvalStatus, input.from),
      ),
    )
    .returning({ organizationId: orgProfiles.organizationId });
  return rows.length === 1;
}

export async function findUserByEmail(db: DbOrTx, email: string) {
  const [row] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email.toLowerCase()))
    .limit(1);
  return row;
}

export async function insertPlatformAdmin(db: DbOrTx, userId: string): Promise<void> {
  await db.insert(platformAdmins).values({ userId }).onConflictDoNothing();
}
