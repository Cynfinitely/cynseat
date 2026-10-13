import { describe, expect, it } from "vitest";
import { orgRoles, type OrgRole } from "../auth/roles";
import { AppError } from "../errors";
import { anonymous, type UserActor } from "./actor";
import { authorizeOrg, authorizePlatform, requireUser, requireVerifiedUser } from "./authorize";
import { can, orgPermissions, type OrgAction } from "./permissions";

// The whole matrix, spelled out. A change to permissions.ts must be made here too.
const expected: Record<OrgAction, Record<OrgRole, boolean>> = {
  "org.view": { admin: true, member: true, door_staff: true },
  "org.settings.update": { admin: true, member: false, door_staff: false },
  "org.members.view": { admin: true, member: true, door_staff: false },
  "org.members.manage": { admin: true, member: false, door_staff: false },
  "org.audit.view": { admin: true, member: false, door_staff: false },
};

const user: UserActor = {
  kind: "user",
  userId: "u1",
  email: "a@example.com",
  name: "A",
  emailVerified: true,
  isPlatformAdmin: false,
};

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : "UNEXPECTED";
  }
  return undefined;
};

describe("organization permissions", () => {
  it("covers exactly the actions in the table", () => {
    expect(Object.keys(expected).sort()).toEqual(Object.keys(orgPermissions).sort());
  });

  for (const action of Object.keys(expected) as OrgAction[]) {
    for (const role of orgRoles) {
      const allowed = expected[action][role];
      it(`${role} ${allowed ? "may" : "may not"} ${action}`, () => {
        expect(can(role, action)).toBe(allowed);
        expect(codeOf(() => authorizeOrg({ role }, action))).toBe(
          allowed ? undefined : "FORBIDDEN",
        );
      });
    }
  }

  it("lets admins do everything", () => {
    for (const action of Object.keys(orgPermissions) as OrgAction[]) {
      expect(can("admin", action)).toBe(true);
    }
  });
});

describe("actor guards", () => {
  it("rejects anonymous callers as unauthenticated", () => {
    expect(codeOf(() => requireUser(anonymous))).toBe("UNAUTHENTICATED");
    expect(codeOf(() => requireVerifiedUser(anonymous))).toBe("UNAUTHENTICATED");
    expect(codeOf(() => authorizePlatform(anonymous, "platform.orgs.review"))).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("requires a verified email where asked", () => {
    expect(codeOf(() => requireVerifiedUser({ ...user, emailVerified: false }))).toBe("FORBIDDEN");
    expect(requireVerifiedUser(user)).toBe(user);
  });

  it("limits platform actions to platform admins", () => {
    expect(codeOf(() => authorizePlatform(user, "platform.orgs.review"))).toBe("FORBIDDEN");
    const admin = { ...user, isPlatformAdmin: true };
    expect(authorizePlatform(admin, "platform.orgs.review")).toBe(admin);
  });
});
