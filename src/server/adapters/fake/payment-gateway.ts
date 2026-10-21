import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  AccountState,
  CheckoutRequest,
  CheckoutState,
  GatewayEvent,
  PaymentGateway,
} from "../../ports/payment-gateway";

type Session = CheckoutState & { request: CheckoutRequest };

/**
 * Stand-in for the payment provider in development and tests. Sessions live in memory;
 * `pay` and `tamper` play the part of the buyer and of anything that might go wrong.
 */
export function createFakePaymentGateway(options: {
  payUrl(sessionId: string): string;
  /** Where the stand-in onboarding form lives. */
  onboardingUrl?(accountId: string, returnUrl: string): string;
  /** Signs notifications, as the provider's webhook secret would. */
  webhookSecret?: string;
}) {
  const sessions = new Map<string, Session>();
  const byOrder = new Map<string, string>();
  const accounts = new Map<string, AccountState>();
  const refunds = new Map<
    string,
    {
      paymentIntentId: string;
      amount: number;
      result: { id: string; status: "succeeded" | "failed"; failureReason?: string };
    }
  >();
  let nextRefundFailure: string | undefined;
  const webhookSecret = options.webhookSecret ?? "fake-webhook-secret";
  const sign = (body: string) => createHmac("sha256", webhookSecret).update(body).digest();

  const gateway: PaymentGateway = {
    async createAccount({ organizationId }) {
      const id = `acct_fake_${organizationId}`;
      if (!accounts.has(id))
        accounts.set(id, { id, chargesEnabled: false, detailsSubmitted: false });
      return { id };
    },
    async createOnboardingLink({ accountId, returnUrl }) {
      return { url: options.onboardingUrl?.(accountId, returnUrl) ?? returnUrl };
    },
    async getAccount(accountId) {
      return accounts.get(accountId) ?? null;
    },
    async refund({ accountId, paymentIntentId, amount, idempotencyKey }) {
      const existing = refunds.get(idempotencyKey);
      if (existing) return existing.result;
      const session = [...sessions.values()].find(
        (candidate) =>
          candidate.paymentIntentId === paymentIntentId && candidate.accountId === accountId,
      );
      const refunded = [...refunds.values()]
        .filter(
          (entry) => entry.paymentIntentId === paymentIntentId && entry.result.status !== "failed",
        )
        .reduce((sum, entry) => sum + entry.amount, 0);
      const failure = !session
        ? "unknown_payment"
        : refunded + amount > session.amountTotal
          ? "amount_too_large"
          : nextRefundFailure;
      nextRefundFailure = undefined;
      const result = failure
        ? {
            id: `re_fake_${randomBytes(8).toString("hex")}`,
            status: "failed" as const,
            failureReason: failure,
          }
        : { id: `re_fake_${randomBytes(8).toString("hex")}`, status: "succeeded" as const };
      refunds.set(idempotencyKey, { paymentIntentId, amount, result });
      return result;
    },
    parseEvent(rawBody, signature) {
      const given = Buffer.from(signature ?? "", "hex");
      const expected = sign(rawBody);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new Error("Invalid webhook signature");
      }
      return JSON.parse(rawBody) as GatewayEvent;
    },
    async createCheckout(request) {
      const existing = byOrder.get(request.orderId);
      if (existing) return { id: existing, url: options.payUrl(existing) };

      const id = `cs_fake_${randomBytes(12).toString("hex")}`;
      sessions.set(id, {
        id,
        request,
        accountId: request.accountId,
        orderId: request.orderId,
        status: "open",
        paid: false,
        amountTotal: request.lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0),
        currency: request.currency,
        paymentIntentId: null,
        url: options.payUrl(id),
      });
      byOrder.set(request.orderId, id);
      return { id, url: options.payUrl(id) };
    },
    async getCheckout({ sessionId, accountId }) {
      const session = sessions.get(sessionId);
      if (!session || session.accountId !== accountId) return null;
      const { request: _request, ...state } = session;
      return state;
    },
    async expireCheckout({ sessionId, accountId }) {
      const session = sessions.get(sessionId);
      if (!session || session.accountId !== accountId) return "expired";
      if (session.status === "complete") return "complete";
      session.status = "expired";
      session.url = null;
      return "expired";
    },
  };

  return {
    ...gateway,
    sessions,
    accounts,
    refunds,
    /** Makes the next refund fail, as when the organization's balance is too low. */
    failNextRefund(reason = "insufficient_funds"): void {
      nextRefundFailure = reason;
    },
    /** The organization finishes (or loses) its onboarding. */
    setAccount(accountId: string, state: Partial<Omit<AccountState, "id">>): void {
      const account = accounts.get(accountId);
      if (account) Object.assign(account, state);
    },
    /** A notification as the provider would deliver it: a body and its signature header. */
    notification(event: Omit<GatewayEvent, "id" | "payload"> & { id?: string }): {
      body: string;
      signature: string;
    } {
      const body = JSON.stringify({
        id: `evt_fake_${randomBytes(8).toString("hex")}`,
        payload: {},
        ...event,
      });
      return { body, signature: sign(body).toString("hex") };
    },
    /** The buyer pays. Returns false if the page was already closed. */
    pay(sessionId: string): boolean {
      const session = sessions.get(sessionId);
      if (!session || session.status !== "open") return false;
      session.status = "complete";
      session.paid = true;
      session.paymentIntentId = `pi_fake_${randomBytes(8).toString("hex")}`;
      session.url = null;
      return true;
    },
    /** Overwrites what the provider reports, to test that mismatches are caught. */
    tamper(sessionId: string, changes: Partial<CheckoutState>): void {
      const session = sessions.get(sessionId);
      if (session) Object.assign(session, changes);
    },
    sessionOf(orderId: string): Session | undefined {
      const id = byOrder.get(orderId);
      return id ? sessions.get(id) : undefined;
    },
  };
}

export type FakePaymentGateway = ReturnType<typeof createFakePaymentGateway>;
