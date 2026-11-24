import Stripe from "stripe";
import type { CheckoutState, DirectMerchant, PaymentGateway } from "../../ports/payment-gateway";

/**
 * Stripe Connect with direct charges: each organization has its own Stripe account, the
 * charge is created on that account, and CynSeat optionally takes an application fee.
 * The organization is the merchant of record and carries refunds and disputes.
 */
export function createStripeGateway(options: {
  directMerchant?: DirectMerchant;
  secretKey?: string;
  /** Signing secret of the webhook endpoint that receives connected-account events. */
  webhookSecret?: string;
  client?: Stripe;
}): PaymentGateway {
  const direct = options.directMerchant;
  let client = options.client;
  function stripe() {
    if (direct && !direct.configured) throw new Error("Merchant payment setup is incomplete");
    if (!client && !options.secretKey) throw new Error("Missing Stripe credential");
    return (client ??= new Stripe(options.secretKey!, { maxNetworkRetries: 2 }));
  }

  async function merchantAccount() {
    const account = await stripe().accounts.retrieve(null);
    if (account.id !== direct!.accountId)
      throw new Error("Stripe credential belongs to a different account");
    return account;
  }

  async function requestOptions(accountId: string): Promise<Stripe.RequestOptions> {
    if (!direct) return { stripeAccount: accountId };
    if (accountId !== direct.accountId) throw new Error("Wrong merchant for this payment");
    await merchantAccount();
    return {};
  }

  const toState = (session: Stripe.Checkout.Session, accountId: string): CheckoutState => ({
    id: session.id,
    accountId,
    orderId: session.metadata?.order_id ?? session.client_reference_id ?? null,
    // Anything Stripe may add later is treated as still open, which never issues tickets.
    status:
      session.status === "complete"
        ? "complete"
        : session.status === "expired"
          ? "expired"
          : "open",
    paid: session.payment_status === "paid",
    amountTotal: session.amount_total ?? 0,
    currency: session.currency ?? "",
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    url: session.url,
  });

  return {
    directMerchant: direct,
    async createAccount({ organizationId, name, email, country }) {
      if (direct) {
        if (organizationId !== direct.organizationId)
          throw new Error("Wrong merchant organization");
        return { id: (await merchantAccount()).id };
      }
      const account = await stripe().accounts.create(
        {
          email,
          country,
          business_profile: { name },
          metadata: { organization_id: organizationId },
          // The organization gets a full Stripe dashboard, pays Stripe's fees itself, and
          // Stripe (not CynSeat) is liable for its negative balances.
          controller: {
            stripe_dashboard: { type: "full" },
            fees: { payer: "account" },
            losses: { payments: "stripe" },
            requirement_collection: "stripe",
          },
        },
        { idempotencyKey: `org:${organizationId}:account` },
      );
      return { id: account.id };
    },

    async createOnboardingLink({ accountId, returnUrl, refreshUrl }) {
      if (direct) {
        if (accountId !== direct.accountId) throw new Error("Wrong merchant account");
        return { url: returnUrl };
      }
      const link = await stripe().accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        return_url: returnUrl,
        refresh_url: refreshUrl,
      });
      return { url: link.url };
    },

    async getAccount(accountId) {
      try {
        if (direct && accountId !== direct.accountId) return null;
        const account = direct
          ? await merchantAccount()
          : await stripe().accounts.retrieve(accountId);
        return {
          id: account.id,
          chargesEnabled: account.charges_enabled,
          detailsSubmitted: account.details_submitted,
        };
      } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError) return null;
        throw error;
      }
    },

    async createCheckout(request) {
      if (direct && request.applicationFeeAmount)
        throw new Error("Direct merchant orders cannot include a platform fee");
      const session = await stripe().checkout.sessions.create(
        {
          mode: "payment",
          ...(direct && { allowed_payment_method_types: ["card"] }),
          client_reference_id: request.orderId,
          metadata: {
            order_id: request.orderId,
            ...(direct && { cynseat_org: direct.organizationId }),
          },
          customer_email: request.customerEmail,
          locale: request.locale as Stripe.Checkout.SessionCreateParams.Locale,
          line_items: request.lines.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency: request.currency,
              unit_amount: line.unitAmount,
              product_data: { name: line.name },
            },
          })),
          payment_intent_data: {
            metadata: { order_id: request.orderId },
            ...(request.applicationFeeAmount > 0
              ? { application_fee_amount: request.applicationFeeAmount }
              : {}),
          },
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          expires_at: Math.floor(request.expiresAt.getTime() / 1000),
        },
        // The same order always yields the same session, even if this call is repeated.
        {
          ...(await requestOptions(request.accountId)),
          idempotencyKey: `order:${request.orderId}:checkout`,
        },
      );
      if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
      return { id: session.id, url: session.url };
    },

    async getCheckout({ sessionId, accountId }) {
      try {
        const session = await stripe().checkout.sessions.retrieve(
          sessionId,
          {},
          await requestOptions(accountId),
        );
        return toState(session, accountId);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError) return null;
        throw error;
      }
    },

    async expireCheckout({ sessionId, accountId }) {
      try {
        await stripe().checkout.sessions.expire(sessionId, {}, await requestOptions(accountId));
        return "expired";
      } catch (error) {
        if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error;
        // Stripe refuses to expire a session that is no longer open: find out which way it went.
        const session = await stripe().checkout.sessions.retrieve(
          sessionId,
          {},
          await requestOptions(accountId),
        );
        return session.status === "complete" ? "complete" : "expired";
      }
    },

    async refund({ accountId, paymentIntentId, amount, idempotencyKey, refundApplicationFee }) {
      const refund = await stripe().refunds.create(
        {
          payment_intent: paymentIntentId,
          amount,
          ...(!direct && { refund_application_fee: refundApplicationFee }),
        },
        { ...(await requestOptions(accountId)), idempotencyKey },
      );
      return {
        id: refund.id,
        status:
          refund.status === "succeeded"
            ? "succeeded"
            : refund.status === "failed"
              ? "failed"
              : "pending",
        failureReason: refund.failure_reason ?? undefined,
      };
    },

    parseEvent(rawBody, signature) {
      if (!options.webhookSecret) throw new Error("Missing Stripe webhook secret");
      const event = stripe().webhooks.constructEvent(
        rawBody,
        signature ?? "",
        options.webhookSecret,
      );
      if (
        direct &&
        ((event.account && event.account !== direct.accountId) ||
          (event.type === "account.updated" && event.data.object.id !== direct.accountId) ||
          event.livemode !== /^(sk|rk)_live_/.test(options.secretKey ?? ""))
      )
        throw new Error("Wrong merchant webhook");
      const object = event.data.object as unknown as Record<string, unknown>;
      const isCheckout = event.type.startsWith("checkout.session.");
      const metadata = (object.metadata ?? {}) as Record<string, string>;
      return {
        id: event.id,
        type: event.type,
        accountId:
          direct?.accountId ??
          event.account ??
          (event.type === "account.updated" ? String(object.id) : null),
        checkoutSessionId: isCheckout ? String(object.id) : null,
        orderId: isCheckout
          ? (metadata.order_id ?? (object.client_reference_id as string | null) ?? null)
          : null,
        payload: event as unknown as Record<string, unknown>,
      };
    },
  };
}
