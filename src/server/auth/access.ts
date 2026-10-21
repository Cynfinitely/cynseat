import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc } from "better-auth/plugins/organization/access";
import type { OrgRole } from "./roles";

// Permissions for Better Auth's own organization endpoints (invite, remove member, rename).
// Everything CynSeat-specific is decided by src/server/authz/permissions.ts.
export const ac = createAccessControl(defaultStatements);

export const roles = {
  admin: ac.newRole({ ...adminAc.statements }),
  member: ac.newRole({ ...memberAc.statements }),
  door_staff: ac.newRole({ ...memberAc.statements }),
} satisfies Record<OrgRole, unknown>;
