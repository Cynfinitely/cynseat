// Roles a user can hold inside an organization. Stored in `member.role`.
export const orgRoles = ["admin", "member", "door_staff"] as const;
export type OrgRole = (typeof orgRoles)[number];

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (orgRoles as readonly string[]).includes(value);
}
