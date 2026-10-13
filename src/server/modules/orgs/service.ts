import type {
  RegisterOrganizationInput,
  ReviewDecision,
  ReviewOrganizationInput,
  UpdateOrgProfileInput,
} from "../../../domain/orgs/schemas";
import { MAX_ORGANIZATIONS_PER_USER } from "../../auth/auth";
import { isOrgRole, type OrgRole } from "../../auth/roles";
import type { Actor, UserActor } from "../../authz/actor";
import {
  authorizeOrg,
  authorizePlatform,
  requireUser,
  requireVerifiedUser,
} from "../../authz/authorize";
import type { Db } from "../../db/client";
import type { ApprovalStatus } from "../../db/schema";
import { conflict, notFound } from "../../errors";
import type { Clock } from "../../ports/clock";
import { recordAudit } from "../audit/service";
import { enqueueEmail, type DbOrTx } from "../notifications/service";
import { toEmailLocale, type EmailTemplate } from "../notifications/templates";
import * as repo from "./repo";

export type OrgSummary = {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
  approvalStatus: ApprovalStatus;
};

/** Proof that `actor` belongs to `organization`, with the role they hold there. */
export type OrgContext = {
  actor: UserActor;
  organization: { id: string; slug: string; name: string };
  role: OrgRole;
  profile: repo.OrgProfile;
};

function asRole(role: string): OrgRole {
  // An unknown stored role gets the least access rather than an error page.
  return isOrgRole(role) ? role : "door_staff";
}

export async function listMyOrganizations(db: Db, actor: Actor): Promise<OrgSummary[]> {
  const user = requireUser(actor);
  const rows = await repo.findOrganizationsOfUser(db, user.userId);
  return rows.map((row) => ({ ...row, role: asRole(row.role) }));
}

/**
 * Resolves the organization from its URL slug and re-reads the membership, so a removed
 * member loses access at once. Someone else's organization is reported as not found.
 */
export async function getOrgContext(db: Db, actor: Actor, slug: string): Promise<OrgContext> {
  const user = requireUser(actor);
  const row = await repo.findMembershipBySlug(db, user.userId, slug);
  if (!row) throw notFound("organization");
  return {
    actor: user,
    organization: { id: row.id, slug: row.slug, name: row.name },
    role: asRole(row.role),
    profile: row.profile,
  };
}

/** Called by the auth layer whenever an organization is created, by any route. */
export async function ensureOrgProfile(db: DbOrTx, organizationId: string): Promise<void> {
  await repo.insertProfileIfMissing(db, organizationId);
}

export type CreateOrganization = (input: {
  name: string;
  slug: string;
  userId: string;
}) => Promise<{ id: string }>;

export async function registerOrganization(
  deps: { db: Db; createOrganization: CreateOrganization },
  actor: Actor,
  input: RegisterOrganizationInput,
): Promise<{ id: string; slug: string }> {
  const user = requireVerifiedUser(actor);
  if ((await repo.countMemberships(deps.db, user.userId)) >= MAX_ORGANIZATIONS_PER_USER) {
    throw conflict("organization_limit");
  }
  if (await repo.slugExists(deps.db, input.slug)) {
    throw conflict("slug_taken", { slug: "slug_taken" });
  }

  let created: { id: string };
  try {
    created = await deps.createOrganization({
      name: input.name,
      slug: input.slug,
      userId: user.userId,
    });
  } catch (error) {
    // Lost a race for the slug between the check above and the insert.
    if (await repo.slugExists(deps.db, input.slug)) {
      throw conflict("slug_taken", { slug: "slug_taken" });
    }
    throw error;
  }

  await deps.db.transaction(async (tx) => {
    await ensureOrgProfile(tx, created.id);
    await repo.updateProfile(tx, created.id, {
      contactEmail: input.contactEmail,
      country: input.country,
      legalName: input.legalName ?? null,
      businessId: input.businessId ?? null,
      website: input.website ?? null,
      description: input.description ?? null,
    });
    await recordAudit(tx, {
      organizationId: created.id,
      actorUserId: user.userId,
      action: "org.registered",
      entityType: "organization",
      entityId: created.id,
      data: { name: input.name, slug: input.slug },
    });
  });

  return { id: created.id, slug: input.slug };
}

export async function updateOrgProfile(
  db: Db,
  ctx: OrgContext,
  input: UpdateOrgProfileInput,
): Promise<void> {
  authorizeOrg(ctx, "org.settings.update");
  await db.transaction(async (tx) => {
    await repo.updateProfile(tx, ctx.organization.id, {
      contactEmail: input.contactEmail,
      country: input.country,
      legalName: input.legalName ?? null,
      businessId: input.businessId ?? null,
      website: input.website ?? null,
      description: input.description ?? null,
    });
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "org.profile_updated",
      entityType: "organization",
      entityId: ctx.organization.id,
    });
  });
}

export type OrgMember = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: Date;
};

export type PendingInvitation = { id: string; email: string; role: OrgRole; expiresAt: Date };

export async function listMembers(
  deps: { db: Db; clock: Clock },
  ctx: OrgContext,
): Promise<{ members: OrgMember[]; invitations: PendingInvitation[] }> {
  authorizeOrg(ctx, "org.members.view");
  const [members, invitations] = await Promise.all([
    repo.findMembers(deps.db, ctx.organization.id),
    repo.findPendingInvitations(deps.db, ctx.organization.id, deps.clock.now()),
  ]);
  return {
    members: members.map((row) => ({ ...row, role: asRole(row.role) })),
    invitations: invitations.map((row) => ({ ...row, role: asRole(row.role ?? "member") })),
  };
}

// ---- Platform review -------------------------------------------------------------------

export type OrgForReview = {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  profile: repo.OrgProfile;
};

export async function listOrganizationsForReview(
  db: Db,
  actor: Actor,
  statuses: ApprovalStatus[],
): Promise<OrgForReview[]> {
  authorizePlatform(actor, "platform.orgs.review");
  return repo.findOrganizationsByStatus(db, statuses);
}

type ReviewEmail = Extract<
  EmailTemplate["template"],
  "orgApproved" | "orgRejected" | "orgSuspended"
>;

const transitions: Record<
  ReviewDecision,
  { from: ApprovalStatus[]; to: ApprovalStatus; email: ReviewEmail }
> = {
  approve: { from: ["pending", "rejected", "suspended"], to: "approved", email: "orgApproved" },
  reject: { from: ["pending"], to: "rejected", email: "orgRejected" },
  suspend: { from: ["approved"], to: "suspended", email: "orgSuspended" },
};

export async function reviewOrganization(
  deps: { db: Db; clock: Clock; appUrl: string },
  actor: Actor,
  input: ReviewOrganizationInput,
): Promise<{ jobIds: string[] }> {
  const reviewer = authorizePlatform(actor, "platform.orgs.review");
  const transition = transitions[input.decision];
  const jobIds: string[] = [];

  await deps.db.transaction(async (tx) => {
    const org = await repo.findOrganizationById(tx, input.organizationId);
    if (!org) throw notFound("organization");

    const moved = await repo.transitionApproval(tx, {
      organizationId: org.id,
      from: transition.from,
      to: transition.to,
      note: input.note ?? null,
      reviewedBy: reviewer.userId,
      at: deps.clock.now(),
    });
    if (!moved) throw conflict("invalid_transition");

    await recordAudit(tx, {
      organizationId: org.id,
      actorUserId: reviewer.userId,
      action: `org.${transition.to}`,
      entityType: "organization",
      entityId: org.id,
      data: { from: org.profile.approvalStatus, note: input.note ?? null },
    });

    const locale = toEmailLocale(org.profile.defaultLocale);
    const url = `${deps.appUrl}/${locale}/dashboard/${org.slug}`;
    for (const admin of await repo.findAdminRecipients(tx, org.id)) {
      const id = await enqueueEmail(tx, deps.clock, {
        to: admin.email,
        locale,
        template: transition.email,
        data: { organization: org.name, url, note: input.note },
      });
      if (id) jobIds.push(id);
    }
  });

  return { jobIds };
}

/** Bootstrap helper for scripts and seeds; there is no UI that grants platform admin. */
export async function grantPlatformAdmin(db: Db, email: string): Promise<boolean> {
  const found = await repo.findUserByEmail(db, email);
  if (!found) return false;
  await repo.insertPlatformAdmin(db, found.id);
  return true;
}

export { isPlatformAdmin } from "./repo";
