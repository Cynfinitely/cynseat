import type { OrgRole } from "../auth/roles";

/**
 * The single source of truth for what each organization role may do.
 * Use-cases call `authorizeOrg`; the UI uses `can` to decide what to show.
 */
export const orgPermissions = {
  "org.view": ["admin", "member", "door_staff"],
  "org.settings.update": ["admin"],
  "org.members.view": ["admin", "member"],
  "org.members.manage": ["admin"],
  "org.audit.view": ["admin"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type OrgAction = keyof typeof orgPermissions;

/** Actions on the platform itself, open to platform admins only. */
export const platformActions = ["platform.orgs.review", "platform.audit.view"] as const;
export type PlatformAction = (typeof platformActions)[number];

export function can(role: OrgRole, action: OrgAction): boolean {
  return (orgPermissions[action] as readonly OrgRole[]).includes(role);
}
