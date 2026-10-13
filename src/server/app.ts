// Wires the use-cases to their dependencies. The Next.js layer and the tests both build an
// `App` from here, differing only in the database, mailer and clock they pass in.
import { createAuth, type Auth, type AuthEmails } from "./auth/auth";
import type { FeeRule } from "../domain/orders/fees";
import { anonymous, type Actor } from "./authz/actor";
import type { Db } from "./db/client";
import { recordAudit } from "./modules/audit/service";
import { sendEmailNow } from "./modules/notifications/service";
import { toEmailLocale, type EmailLocale } from "./modules/notifications/templates";
import { refundUnfulfillableOrder } from "./modules/refunds/service";
import { ensureOrgProfile, isPlatformAdmin, type CreateOrganization } from "./modules/orgs/service";
import type { Clock } from "./ports/clock";
import type { Mailer } from "./ports/mailer";
import type { ObjectStore } from "./ports/object-store";
import type { PaymentGateway } from "./ports/payment-gateway";

export type AppConfig = {
  db: Db;
  mailer: Mailer;
  /** Where uploaded images go. */
  store: ObjectStore;
  clock: Clock;
  /** Public origin, no trailing slash. */
  appUrl: string;
  authSecret: string;
  /** Per-IP limits on the auth endpoints. */
  authRateLimit: boolean;
  gateway: PaymentGateway;
  /** Key for order links and ticket QR codes. Changing it invalidates both. */
  signingSecret: string;
  /** CynSeat's fee on paid orders, unless an organization has its own. */
  platformFee: FeeRule;
};

export type App = AppConfig & {
  auth: Auth;
  createOrganization: CreateOrganization;
  /** Refunds a paid order that could not be given tickets. */
  onUnfulfillable?: (orderId: string) => Promise<void>;
  resolveActor(headers: Headers): Promise<Actor>;
  /** A pending invitation addressed to the signed-in user, or null. */
  findInvitation(headers: Headers, invitationId: string): Promise<PendingInvitationView | null>;
};

export type PendingInvitationView = {
  id: string;
  role: string;
  organizationName: string;
  organizationSlug: string;
  inviterEmail: string;
};

/** next-intl remembers the visitor's language in this cookie. */
function localeOf(request: Request | undefined): EmailLocale {
  const cookie = request?.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)NEXT_LOCALE=([a-z]{2})/.exec(cookie);
  return toEmailLocale(match?.[1]);
}

export function createApp(config: AppConfig): App {
  const { db, mailer, clock, appUrl } = config;
  const mail = { db, mailer, clock };

  const emails: AuthEmails = {
    sendVerification: ({ user, url, request }) =>
      sendEmailNow(mail, {
        to: user.email,
        locale: localeOf(request),
        template: "verifyEmail",
        data: { name: user.name, url },
      }),
    sendPasswordReset: ({ user, url, request }) =>
      sendEmailNow(mail, {
        to: user.email,
        locale: localeOf(request),
        template: "resetPassword",
        data: { name: user.name, url },
      }),
    sendInvitation: ({ invitationId, email, role, organizationName, inviterName, request }) => {
      const locale = localeOf(request);
      return sendEmailNow(mail, {
        to: email,
        locale,
        template: "orgInvitation",
        data: {
          inviter: inviterName,
          organization: organizationName,
          role,
          url: `${appUrl}/${locale}/accept-invitation/${invitationId}`,
        },
      });
    },
  };

  const auth = createAuth({
    db,
    baseURL: appUrl,
    secret: config.authSecret,
    rateLimit: config.authRateLimit,
    emails,
    onOrganizationCreated: ({ organizationId }) => ensureOrgProfile(db, organizationId),
    onMembershipEvent: (event) =>
      recordAudit(db, {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId ?? null,
        action: event.action,
        entityType: "member",
        entityId: event.subject,
        data: event.data,
      }),
  });

  // Built last and attached, so the checkout code can ask for a refund without the two
  // modules importing each other.
  const app: App = {
    ...config,
    auth,
    async createOrganization(input) {
      const created = await auth.api.createOrganization({ body: input });
      if (!created) throw new Error("Organization was not created");
      return { id: created.id };
    },
    async findInvitation(headers, invitationId) {
      try {
        const found = await auth.api.getInvitation({ query: { id: invitationId }, headers });
        if (!found || found.status !== "pending") return null;
        return {
          id: found.id,
          role: found.role,
          organizationName: found.organizationName,
          organizationSlug: found.organizationSlug,
          inviterEmail: found.inviterEmail,
        };
      } catch {
        // Not signed in, not the recipient, expired or unknown: all look the same to the caller.
        return null;
      }
    },
    async resolveActor(headers) {
      const session = await auth.api.getSession({ headers });
      if (!session) return anonymous;
      return {
        kind: "user",
        userId: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
        isPlatformAdmin: await isPlatformAdmin(db, session.user.id),
      };
    },
  };
  app.onUnfulfillable = (orderId) => refundUnfulfillableOrder(app, orderId);
  return app;
}
