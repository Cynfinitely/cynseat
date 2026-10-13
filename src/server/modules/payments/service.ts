import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { authorizeOrg } from "../../authz/authorize";
import type { Db } from "../../db/client";
import { orders, orgProfiles, paymentEvents } from "../../db/schema";
import { conflict } from "../../errors";
import type { Clock } from "../../ports/clock";
import type { GatewayEvent } from "../../ports/payment-gateway";
import { recordAudit } from "../audit/service";
import { confirmPayment, type CheckoutDeps } from "../checkout/service";
import type { OrgContext } from "../orgs/service";

type Deps = CheckoutDeps;

export type PaymentStatus = {
  /** "none": never started. "incomplete": the provider still needs details. "ready": can sell. */
  state: "none" | "incomplete" | "ready";
  accountId: string | null;
};

export function paymentStatusOf(profile: OrgContext["profile"]): PaymentStatus {
  if (!profile.stripeAccountId) return { state: "none", accountId: null };
  return {
    state: profile.stripeChargesEnabled ? "ready" : "incomplete",
    accountId: profile.stripeAccountId,
  };
}

/**
 * Starts or resumes connecting the organization's payment account and returns the link to
 * the provider's onboarding form. The account is created only for approved organizations.
 */
export async function startPaymentOnboarding(
  deps: Deps,
  ctx: OrgContext,
  locale: string,
): Promise<{ url: string }> {
  authorizeOrg(ctx, "org.payments.manage");
  if (ctx.profile.approvalStatus !== "approved") throw conflict("org_not_approved");

  let accountId = ctx.profile.stripeAccountId;
  if (!accountId) {
    const created = await deps.gateway.createAccount({
      organizationId: ctx.organization.id,
      name: ctx.organization.name,
      email: ctx.profile.contactEmail ?? ctx.actor.email,
      country: ctx.profile.country ?? "FI",
    });
    // Two admins clicking at once create the same account (the call is idempotent per
    // organization); whichever write lands first wins and the other reads it back.
    await deps.db.transaction(async (tx) => {
      await tx
        .update(orgProfiles)
        .set({ stripeAccountId: created.id, updatedAt: deps.clock.now() })
        .where(
          and(
            eq(orgProfiles.organizationId, ctx.organization.id),
            isNull(orgProfiles.stripeAccountId),
          ),
        );
      await recordAudit(tx, {
        organizationId: ctx.organization.id,
        actorUserId: ctx.actor.userId,
        action: "payments.account_created",
        entityType: "organization",
        entityId: ctx.organization.id,
      });
    });
    const [profile] = await deps.db
      .select({ accountId: orgProfiles.stripeAccountId })
      .from(orgProfiles)
      .where(eq(orgProfiles.organizationId, ctx.organization.id));
    accountId = profile!.accountId!;
  }

  const base = `${deps.appUrl}/${locale}/dashboard/${ctx.organization.slug}/payments`;
  return deps.gateway.createOnboardingLink({
    accountId,
    // Coming back proves nothing: the page re-reads the account from the provider.
    returnUrl: `${base}?returned=1`,
    refreshUrl: base,
  });
}

/**
 * Copies the account's current state from the provider. Always asks the provider rather
 * than trusting what a notification says, since notifications can arrive out of order.
 */
export async function syncPaymentAccount(
  deps: { db: Db; clock: Clock; gateway: Deps["gateway"] },
  accountId: string,
): Promise<void> {
  const account = await deps.gateway.getAccount(accountId);
  if (!account) return;
  const now = deps.clock.now();
  await deps.db
    .update(orgProfiles)
    .set({
      stripeChargesEnabled: account.chargesEnabled,
      stripeDetailsSubmitted: account.detailsSubmitted,
      stripeSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(orgProfiles.stripeAccountId, accountId));
}

/** Refreshes the caller's organization from the provider, e.g. on return from onboarding. */
export async function refreshPaymentStatus(deps: Deps, ctx: OrgContext): Promise<void> {
  authorizeOrg(ctx, "org.payments.manage");
  if (ctx.profile.stripeAccountId) await syncPaymentAccount(deps, ctx.profile.stripeAccountId);
}

// ---- Provider notifications --------------------------------------------------------------

/**
 * Handles one verified notification. The event log is for audit and replay only: whether
 * work has been done is decided by the order or account itself, so a notification that
 * failed half-way is simply processed again when the provider retries it.
 */
export async function handleGatewayEvent(deps: Deps, event: GatewayEvent): Promise<void> {
  const now = deps.clock.now();
  await deps.db
    .insert(paymentEvents)
    .values({
      id: event.id,
      type: event.type,
      accountId: event.accountId,
      payload: event.payload,
      receivedAt: now,
    })
    .onConflictDoNothing();

  try {
    if (event.type.startsWith("checkout.session.")) {
      const orderId = await findOrderForSession(deps.db, event);
      if (orderId) await confirmPayment(deps, orderId);
    } else if (event.type === "account.updated" && event.accountId) {
      await syncPaymentAccount(deps, event.accountId);
    }
    await deps.db
      .update(paymentEvents)
      .set({
        processedAt: deps.clock.now(),
        attempts: sql`${paymentEvents.attempts} + 1`,
        lastError: null,
      })
      .where(eq(paymentEvents.id, event.id));
  } catch (error) {
    await deps.db
      .update(paymentEvents)
      .set({
        attempts: sql`${paymentEvents.attempts} + 1`,
        lastError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(paymentEvents.id, event.id));
    // Rethrow so the provider is told to deliver it again.
    throw error;
  }
}

/**
 * The order a payment-page event is about. Matched on the session id and the account it
 * came from, never on the order id inside the event alone.
 */
async function findOrderForSession(db: Db, event: GatewayEvent): Promise<string | null> {
  if (!event.checkoutSessionId || !event.accountId) return null;
  const [bySession] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.stripeCheckoutSessionId, event.checkoutSessionId),
        eq(orders.stripeAccountId, event.accountId),
      ),
    );
  if (bySession) return bySession.id;
  // The session id may not be stored yet if we crashed right after creating the page.
  // Adopt it, but only for a pending order on the same account that has none.
  if (!event.orderId || !/^[0-9a-f-]{36}$/.test(event.orderId)) return null;
  const adopted = await db
    .update(orders)
    .set({ stripeCheckoutSessionId: event.checkoutSessionId })
    .where(
      and(
        eq(orders.id, event.orderId),
        eq(orders.stripeAccountId, event.accountId),
        isNull(orders.stripeCheckoutSessionId),
      ),
    )
    .returning({ id: orders.id });
  return adopted[0]?.id ?? null;
}

/**
 * Settles orders whose payment page should have closed by now, in case a notification
 * never arrived. Run by the scheduler.
 */
export async function reconcilePendingOrders(deps: Deps, limit = 50): Promise<number> {
  const due = await deps.db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pending"), lte(orders.checkoutExpiresAt, deps.clock.now())))
    .limit(limit);
  let settled = 0;
  for (const order of due) {
    const status = await confirmPayment(deps, order.id).catch(() => "pending");
    if (status !== "pending") settled += 1;
  }
  return settled;
}
