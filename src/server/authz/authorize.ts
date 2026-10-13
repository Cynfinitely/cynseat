import type { OrgRole } from "../auth/roles";
import { forbidden, unauthenticated } from "../errors";
import type { Actor, UserActor } from "./actor";
import { can, type OrgAction, type PlatformAction } from "./permissions";

export function requireUser(actor: Actor): UserActor {
  if (actor.kind !== "user") throw unauthenticated();
  return actor;
}

export function requireVerifiedUser(actor: Actor): UserActor {
  const user = requireUser(actor);
  if (!user.emailVerified) throw forbidden("email_not_verified");
  return user;
}

// The action is part of the signature so every call site names what it is guarding.
export function authorizePlatform(actor: Actor, _action: PlatformAction): UserActor {
  const user = requireUser(actor);
  if (!user.isPlatformAdmin) throw forbidden();
  return user;
}

/** Throws unless a member with `role` may perform `action`. */
export function authorizeOrg(membership: { role: OrgRole }, action: OrgAction): void {
  if (!can(membership.role, action)) throw forbidden();
}
