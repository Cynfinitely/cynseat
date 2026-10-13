import { randomBytes } from "node:crypto";
import type { CheckoutRequest, CheckoutState, PaymentGateway } from "../../ports/payment-gateway";

type Session = CheckoutState & { request: CheckoutRequest };

/**
 * Stand-in for the payment provider in development and tests. Sessions live in memory;
 * `pay` and `tamper` play the part of the buyer and of anything that might go wrong.
 */
export function createFakePaymentGateway(options: { payUrl(sessionId: string): string }) {
  const sessions = new Map<string, Session>();
  const byOrder = new Map<string, string>();

  const gateway: PaymentGateway = {
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
