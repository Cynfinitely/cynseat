import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { ac, roles } from "./access";

export type AuthEmailUser = { id: string; email: string; name: string };

/** Emails the auth layer needs sent. Implemented by the notifications module. */
export type AuthEmails = {
  sendVerification(input: { user: AuthEmailUser; url: string; request?: Request }): Promise<void>;
  sendPasswordReset(input: { user: AuthEmailUser; url: string; request?: Request }): Promise<void>;
  sendInvitation(input: {
    invitationId: string;
    email: string;
    role: string;
    organizationName: string;
    inviterName: string;
    request?: Request;
  }): Promise<void>;
};

export type AuthDeps = {
  db: Db;
  baseURL: string;
  secret: string;
  emails: AuthEmails;
  /** Called once an organization exists, so its CynSeat profile can be created. */
  onOrganizationCreated(input: { organizationId: string; userId: string }): Promise<void>;
  /** Membership changes made through Better Auth's endpoints, for the audit log. */
  onMembershipEvent(event: MembershipEvent): Promise<void>;
};

export type MembershipEvent = {
  action:
    | "member.invited"
    | "member.invitation_cancelled"
    | "member.joined"
    | "member.removed"
    | "member.role_changed";
  organizationId: string;
  /** Who did it, when Better Auth tells us. */
  actorUserId?: string;
  /** The invitation's email address or the affected user's id. */
  subject: string;
  data: Record<string, unknown>;
};

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_ORGANIZATIONS_PER_USER = 5;

export function createAuth(deps: AuthDeps) {
  return betterAuth({
    appName: "CynSeat",
    baseURL: deps.baseURL,
    secret: deps.secret,
    database: drizzleAdapter(deps.db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }, request) =>
        deps.emails.sendPasswordReset({ user, url, request }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }, request) =>
        deps.emails.sendVerification({ user, url, request }),
    },
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: "admin",
        // Organizations are suspended by platform admins, never deleted by their members.
        disableOrganizationDeletion: true,
        organizationLimit: MAX_ORGANIZATIONS_PER_USER,
        allowUserToCreateOrganization: (user) => user.emailVerified === true,
        requireEmailVerificationOnInvitation: true,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: (data, request) =>
          deps.emails.sendInvitation({
            invitationId: data.id,
            email: data.email,
            role: data.role,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            request,
          }),
        organizationHooks: {
          afterCreateOrganization: ({ organization: created, user }) =>
            deps.onOrganizationCreated({ organizationId: created.id, userId: user.id }),
          afterCreateInvitation: ({ invitation, inviter, organization: org }) =>
            deps.onMembershipEvent({
              action: "member.invited",
              organizationId: org.id,
              actorUserId: inviter.id,
              subject: invitation.email,
              data: { role: invitation.role },
            }),
          afterCancelInvitation: ({ invitation, cancelledBy, organization: org }) =>
            deps.onMembershipEvent({
              action: "member.invitation_cancelled",
              organizationId: org.id,
              actorUserId: cancelledBy.id,
              subject: invitation.email,
              data: {},
            }),
          afterAcceptInvitation: ({ member, user, organization: org }) =>
            deps.onMembershipEvent({
              action: "member.joined",
              organizationId: org.id,
              actorUserId: user.id,
              subject: user.id,
              data: { role: member.role },
            }),
          afterRemoveMember: ({ member, organization: org }) =>
            deps.onMembershipEvent({
              action: "member.removed",
              organizationId: org.id,
              subject: member.userId,
              data: { role: member.role },
            }),
          afterUpdateMemberRole: ({ member, previousRole, organization: org }) =>
            deps.onMembershipEvent({
              action: "member.role_changed",
              organizationId: org.id,
              subject: member.userId,
              data: { from: previousRole, to: member.role },
            }),
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
