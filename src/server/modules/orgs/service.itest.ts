import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addMember,
  codeOf,
  createUser,
  unique,
  setupTestApp,
  type TestApp,
  type TestUser,
} from "../../../../tests/integration/test-app";
import type { RegisterOrganizationInput } from "../../../domain/orgs/schemas";
import { MAX_ORGANIZATIONS_PER_USER } from "../../auth/auth";
import { anonymous } from "../../authz/actor";
import { auditLog, member, orgProfiles, outboxJobs } from "../../db/schema";
import {
  getOrgContext,
  listMembers,
  listMyOrganizations,
  listOrganizationsForReview,
  registerOrganization,
  reviewOrganization,
  updateOrgProfile,
} from "./service";

const input = (overrides: Partial<RegisterOrganizationInput> = {}): RegisterOrganizationInput => ({
  name: "Tiyatro Maydanoz",
  slug: unique("tiyatro"),
  contactEmail: "info@example.org",
  country: "FI",
  ...overrides,
});

async function register(app: TestApp, owner: TestUser, overrides = {}) {
  const data = input(overrides);
  const org = await registerOrganization(app, owner.actor, data);
  return { ...org, name: data.name };
}

describe("organizations", () => {
  const getApp = setupTestApp();
  const profileOf = async (organizationId: string) => {
    const [row] = await getApp()
      .db.select()
      .from(orgProfiles)
      .where(eq(orgProfiles.organizationId, organizationId));
    return row!;
  };
  const auditActions = async (organizationId: string) => {
    const rows = await getApp()
      .db.select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.organizationId, organizationId))
      .orderBy(auditLog.createdAt);
    return rows.map((row) => row.action);
  };

  describe("registration", () => {
    it("creates a pending organization with the registrant as admin", async () => {
      const app = getApp();
      const owner = await createUser(app);
      const org = await register(app, owner, {
        website: "https://example.org",
        legalName: "TM ry",
      });

      expect(await profileOf(org.id)).toMatchObject({
        approvalStatus: "pending",
        contactEmail: "info@example.org",
        country: "FI",
        website: "https://example.org",
        legalName: "TM ry",
        reviewedAt: null,
      });
      expect(await listMyOrganizations(app.db, owner.actor)).toEqual([
        expect.objectContaining({ id: org.id, role: "admin", approvalStatus: "pending" }),
      ]);
      expect(await auditActions(org.id)).toEqual(["org.registered"]);
    });

    it("requires a signed-in user with a verified email", async () => {
      const app = getApp();
      const unverified = await createUser(app, { verified: false });
      expect(await codeOf(() => registerOrganization(app, anonymous, input()))).toBe(
        "UNAUTHENTICATED",
      );
      expect(await codeOf(() => registerOrganization(app, unverified.actor, input()))).toBe(
        "FORBIDDEN",
      );
    });

    it("rejects a slug that is already taken, naming the field", async () => {
      const app = getApp();
      const first = await register(app, await createUser(app));
      const error = await registerOrganization(
        app,
        (await createUser(app)).actor,
        input({ slug: first.slug }),
      ).catch((caught: unknown) => caught);
      expect(error).toMatchObject({
        code: "CONFLICT",
        reason: "slug_taken",
        fields: { slug: "slug_taken" },
      });
    });

    it("lets only one of two simultaneous registrations take a slug", async () => {
      const app = getApp();
      const slug = unique("race");
      const users = await Promise.all([createUser(app), createUser(app)]);
      const results = await Promise.all(
        users.map((user) => codeOf(() => registerOrganization(app, user.actor, input({ slug })))),
      );
      expect(results.sort()).toEqual(["CONFLICT", "none"]);
    });

    it("caps how many organizations one user can belong to", async () => {
      const app = getApp();
      const owner = await createUser(app);
      for (let i = 0; i < MAX_ORGANIZATIONS_PER_USER; i += 1) await register(app, owner);
      expect(await codeOf(() => registerOrganization(app, owner.actor, input()))).toBe("CONFLICT");
    });

    it("gives a pending profile to organizations created through the auth API directly", async () => {
      const app = getApp();
      const owner = await createUser(app);
      const created = await app.auth.api.createOrganization({
        body: { name: "Direct", slug: unique("direct") },
        headers: owner.headers,
      });
      expect((await profileOf(created!.id)).approvalStatus).toBe("pending");
    });

    it("cannot be approved through the auth API's own update endpoint", async () => {
      const app = getApp();
      const owner = await createUser(app);
      const org = await register(app, owner);
      await app.auth.api.updateOrganization({
        body: {
          organizationId: org.id,
          data: { name: "Renamed", metadata: { approvalStatus: "approved" } },
        },
        headers: owner.headers,
      });
      expect((await profileOf(org.id)).approvalStatus).toBe("pending");
    });
  });

  describe("tenant isolation", () => {
    it("reports another organization as not found, and lists only one's own", async () => {
      const app = getApp();
      const [alice, bob] = await Promise.all([createUser(app), createUser(app)]);
      const a = await register(app, alice);
      const b = await register(app, bob);

      expect((await getOrgContext(app.db, alice.actor, a.slug)).organization.id).toBe(a.id);
      expect(await codeOf(() => getOrgContext(app.db, alice.actor, b.slug))).toBe("NOT_FOUND");
      expect(await codeOf(() => getOrgContext(app.db, anonymous, a.slug))).toBe("UNAUTHENTICATED");
      expect((await listMyOrganizations(app.db, alice.actor)).map((org) => org.id)).toEqual([a.id]);
    });

    it("cuts off a removed member immediately, even with a live session", async () => {
      const app = getApp();
      const [owner, staff] = await Promise.all([createUser(app), createUser(app)]);
      const org = await register(app, owner);
      await addMember(app, org.id, staff, "member");
      expect((await getOrgContext(app.db, staff.actor, org.slug)).role).toBe("member");

      await app.auth.api.removeMember({
        body: { organizationId: org.id, memberIdOrEmail: staff.actor.email },
        headers: owner.headers,
      });

      expect(await app.resolveActor(staff.headers)).toMatchObject({ kind: "user" });
      expect(await codeOf(() => getOrgContext(app.db, staff.actor, org.slug))).toBe("NOT_FOUND");
    });

    it("stops an admin of one organization inviting into another", async () => {
      const app = getApp();
      const [alice, bob] = await Promise.all([createUser(app), createUser(app)]);
      await register(app, alice);
      const b = await register(app, bob);

      await expect(
        app.auth.api.createInvitation({
          body: { organizationId: b.id, email: "mole@example.com", role: "admin" },
          headers: alice.headers,
        }),
      ).rejects.toThrow();
    });
  });

  describe("roles", () => {
    it("lets admins edit the profile and nobody else", async () => {
      const app = getApp();
      const [owner, staff, door] = await Promise.all([
        createUser(app),
        createUser(app),
        createUser(app),
      ]);
      const org = await register(app, owner);
      await addMember(app, org.id, staff, "member");
      await addMember(app, org.id, door, "door_staff");
      const change = { contactEmail: "new@example.org", country: "TR" };

      for (const user of [staff, door]) {
        const ctx = await getOrgContext(app.db, user.actor, org.slug);
        expect(await codeOf(() => updateOrgProfile(app.db, ctx, change))).toBe("FORBIDDEN");
      }
      await updateOrgProfile(app.db, await getOrgContext(app.db, owner.actor, org.slug), change);
      expect(await profileOf(org.id)).toMatchObject({
        contactEmail: "new@example.org",
        country: "TR",
      });
    });

    it("shows the member list to admins and members but not door staff", async () => {
      const app = getApp();
      const [owner, staff, door] = await Promise.all([
        createUser(app),
        createUser(app),
        createUser(app),
      ]);
      const org = await register(app, owner);
      await addMember(app, org.id, staff, "member");
      await addMember(app, org.id, door, "door_staff");

      const seen = await listMembers(app, await getOrgContext(app.db, staff.actor, org.slug));
      expect(seen.members.map((row) => row.role).sort()).toEqual(["admin", "door_staff", "member"]);
      const doorCtx = await getOrgContext(app.db, door.actor, org.slug);
      expect(await codeOf(() => listMembers(app, doorCtx))).toBe("FORBIDDEN");
    });

    it("lets only admins invite, and the invitee joins with the invited role", async () => {
      const app = getApp();
      const [owner, staff] = await Promise.all([createUser(app), createUser(app)]);
      const org = await register(app, owner);
      await addMember(app, org.id, staff, "member");
      const invitee = await createUser(app);

      await expect(
        app.auth.api.createInvitation({
          body: { organizationId: org.id, email: invitee.actor.email, role: "door_staff" },
          headers: staff.headers,
        }),
      ).rejects.toThrow();

      const invitation = await app.auth.api.createInvitation({
        body: { organizationId: org.id, email: invitee.actor.email, role: "door_staff" },
        headers: owner.headers,
      });
      const mail = app.mailer.sent.find(
        (sent) => sent.to === invitee.actor.email && sent.subject.includes("invited you"),
      );
      expect(mail?.text).toContain(`/en/accept-invitation/${invitation.id}`);
      expect(mail?.text).toContain("door staff");

      const pending = await listMembers(app, await getOrgContext(app.db, owner.actor, org.slug));
      expect(pending.invitations).toEqual([
        expect.objectContaining({ email: invitee.actor.email, role: "door_staff" }),
      ]);

      await app.auth.api.acceptInvitation({
        body: { invitationId: invitation.id },
        headers: invitee.headers,
      });
      expect((await getOrgContext(app.db, invitee.actor, org.slug)).role).toBe("door_staff");
      expect(await auditActions(org.id)).toEqual(
        expect.arrayContaining(["member.invited", "member.joined"]),
      );
    });

    it("does not let someone else accept an invitation", async () => {
      const app = getApp();
      const owner = await createUser(app);
      const org = await register(app, owner);
      const invitation = await app.auth.api.createInvitation({
        body: { organizationId: org.id, email: "intended@example.com", role: "admin" },
        headers: owner.headers,
      });
      const thief = await createUser(app);

      await expect(
        app.auth.api.acceptInvitation({
          body: { invitationId: invitation.id },
          headers: thief.headers,
        }),
      ).rejects.toThrow();
      expect(await codeOf(() => getOrgContext(app.db, thief.actor, org.slug))).toBe("NOT_FOUND");
    });

    it("never has two memberships for one user in one organization", async () => {
      const app = getApp();
      const [owner, staff] = await Promise.all([createUser(app), createUser(app)]);
      const org = await register(app, owner);
      await Promise.allSettled([
        addMember(app, org.id, staff, "member"),
        addMember(app, org.id, staff, "member"),
        addMember(app, org.id, staff, "door_staff"),
      ]);
      const rows = await app.db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.userId, staff.actor.userId)));
      expect(rows).toHaveLength(1);
    });
  });

  describe("platform review", () => {
    it("is closed to everyone but platform admins", async () => {
      const app = getApp();
      const owner = await createUser(app);
      const org = await register(app, owner);
      const decision = { organizationId: org.id, decision: "approve" as const };

      expect(await codeOf(() => reviewOrganization(app, owner.actor, decision))).toBe("FORBIDDEN");
      expect(await codeOf(() => reviewOrganization(app, anonymous, decision))).toBe(
        "UNAUTHENTICATED",
      );
      expect(await codeOf(() => listOrganizationsForReview(app.db, owner.actor, ["pending"]))).toBe(
        "FORBIDDEN",
      );
      expect((await profileOf(org.id)).approvalStatus).toBe("pending");
    });

    it("approves a pending organization, audits it and emails its admins only", async () => {
      const app = getApp();
      const [owner, staff, reviewer] = await Promise.all([
        createUser(app),
        createUser(app),
        createUser(app, { platformAdmin: true }),
      ]);
      const org = await register(app, owner);
      await addMember(app, org.id, staff, "member");

      expect(
        (await listOrganizationsForReview(app.db, reviewer.actor, ["pending"])).map(
          (row) => row.id,
        ),
      ).toContain(org.id);

      const { jobIds } = await reviewOrganization(app, reviewer.actor, {
        organizationId: org.id,
        decision: "approve",
      });

      expect(await profileOf(org.id)).toMatchObject({
        approvalStatus: "approved",
        reviewedBy: reviewer.actor.userId,
      });
      expect(await auditActions(org.id)).toContain("org.approved");
      expect(jobIds).toHaveLength(1);
      const [job] = await app.db.select().from(outboxJobs).where(eq(outboxJobs.id, jobIds[0]!));
      expect(job!.payload).toMatchObject({
        to: owner.actor.email,
        template: "orgApproved",
        data: { organization: org.name, url: `http://localhost:3000/en/dashboard/${org.slug}` },
      });
    });

    it("only allows the transitions that make sense", async () => {
      const app = getApp();
      const reviewer = await createUser(app, { platformAdmin: true });
      const org = await register(app, await createUser(app));
      const review = (decision: "approve" | "reject" | "suspend") =>
        codeOf(() =>
          reviewOrganization(app, reviewer.actor, { organizationId: org.id, decision, note: "n" }),
        );

      expect(await review("suspend")).toBe("CONFLICT"); // pending cannot be suspended
      expect(await review("reject")).toBe("none");
      expect(await review("reject")).toBe("CONFLICT");
      expect(await review("approve")).toBe("none"); // a rejection can be reversed
      expect(await review("reject")).toBe("CONFLICT");
      expect(await review("suspend")).toBe("none");
      expect(await review("approve")).toBe("none");
      expect((await profileOf(org.id)).approvalNote).toBe("n");
    });

    it("lets exactly one of two conflicting simultaneous reviews win", async () => {
      const app = getApp();
      const reviewer = await createUser(app, { platformAdmin: true });
      const org = await register(app, await createUser(app));

      const results = await Promise.all(
        (["approve", "reject"] as const).map((decision) =>
          codeOf(() =>
            reviewOrganization(app, reviewer.actor, { organizationId: org.id, decision }),
          ),
        ),
      );

      expect(results.sort()).toEqual(["CONFLICT", "none"]);
      const actions = await auditActions(org.id);
      expect(actions.filter((action) => action !== "org.registered")).toHaveLength(1);
    });

    it("reports an unknown organization as not found", async () => {
      const app = getApp();
      const reviewer = await createUser(app, { platformAdmin: true });
      expect(
        await codeOf(() =>
          reviewOrganization(app, reviewer.actor, { organizationId: "nope", decision: "approve" }),
        ),
      ).toBe("NOT_FOUND");
    });
  });

  describe("resolveActor", () => {
    it("maps a session to an actor and no session to anonymous", async () => {
      const app = getApp();
      const admin = await createUser(app, { platformAdmin: true });
      expect(await app.resolveActor(new Headers())).toEqual(anonymous);
      expect(await app.resolveActor(admin.headers)).toEqual(admin.actor);
    });
  });
});
