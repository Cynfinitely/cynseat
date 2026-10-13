import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeGateway } from "./payment-gateway";

const WEBHOOK_SECRET = "whsec_test_secret";
const signer = new Stripe("sk_test_unused");

type Call = { method: string; args: unknown[] };

/** A stand-in for the SDK client that records calls and returns canned answers. */
function stubClient(answers: Record<string, (...args: unknown[]) => unknown>) {
  const calls: Call[] = [];
  const method =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push({ method: name, args });
      const answer = answers[name];
      if (!answer) throw new Error(`unexpected call ${name}`);
      return answer(...args);
    };
  const client = {
    accounts: { create: method("accounts.create"), retrieve: method("accounts.retrieve") },
    accountLinks: { create: method("accountLinks.create") },
    checkout: {
      sessions: {
        create: method("sessions.create"),
        retrieve: method("sessions.retrieve"),
        expire: method("sessions.expire"),
      },
    },
    webhooks: signer.webhooks,
  } as unknown as Stripe;
  return {
    calls,
    gateway: createStripeGateway({ secretKey: "sk", webhookSecret: WEBHOOK_SECRET, client }),
  };
}

const request = {
  orderId: "0b5c2f0e-7c1d-4a55-9e0b-2f3a4b5c6d7e",
  accountId: "acct_org",
  currency: "eur",
  lines: [{ name: "Standard", unitAmount: 1250, quantity: 2 }],
  applicationFeeAmount: 0,
  customerEmail: "buyer@example.com",
  locale: "fi",
  successUrl: "https://app.test/fi/orders/t",
  cancelUrl: "https://app.test/fi/checkout/e",
  expiresAt: new Date("2030-01-01T00:31:00Z"),
};

describe("Stripe gateway", () => {
  it("creates the payment page on the organization's account, priced from the order", async () => {
    const { calls, gateway } = stubClient({
      "sessions.create": () => ({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }),
    });

    expect(await gateway.createCheckout(request)).toEqual({
      id: "cs_1",
      url: "https://checkout.stripe.test/cs_1",
    });
    const [params, options] = calls[0]!.args as [Record<string, unknown>, Record<string, unknown>];
    expect(options).toEqual({
      stripeAccount: "acct_org",
      idempotencyKey: `order:${request.orderId}:checkout`,
    });
    expect(params).toMatchObject({
      mode: "payment",
      client_reference_id: request.orderId,
      metadata: { order_id: request.orderId },
      customer_email: "buyer@example.com",
      locale: "fi",
      expires_at: 1893457860,
      line_items: [
        {
          quantity: 2,
          price_data: { currency: "eur", unit_amount: 1250, product_data: { name: "Standard" } },
        },
      ],
    });
    // No platform fee: the field must be absent, since Stripe rejects a zero fee.
    expect(params.payment_intent_data).toEqual({ metadata: { order_id: request.orderId } });
  });

  it("adds the platform fee when there is one", async () => {
    const { calls, gateway } = stubClient({
      "sessions.create": () => ({ id: "cs_1", url: "https://x.test" }),
    });
    await gateway.createCheckout({ ...request, applicationFeeAmount: 123 });
    const [params] = calls[0]!.args as [{ payment_intent_data: unknown }];
    expect(params.payment_intent_data).toMatchObject({ application_fee_amount: 123 });
  });

  it("reports a session as paid only when Stripe says the money was collected", async () => {
    const session = {
      id: "cs_1",
      status: "complete",
      payment_status: "unpaid",
      amount_total: 2500,
      currency: "eur",
      payment_intent: "pi_1",
      metadata: { order_id: request.orderId },
      url: null,
    };
    const { calls, gateway } = stubClient({ "sessions.retrieve": () => session });

    expect(await gateway.getCheckout({ sessionId: "cs_1", accountId: "acct_org" })).toMatchObject({
      status: "complete",
      paid: false,
      orderId: request.orderId,
      amountTotal: 2500,
      paymentIntentId: "pi_1",
    });
    expect(calls[0]!.args[2]).toEqual({ stripeAccount: "acct_org" });

    session.payment_status = "paid";
    expect((await gateway.getCheckout({ sessionId: "cs_1", accountId: "acct_org" }))?.paid).toBe(
      true,
    );
    session.status = "something_new";
    expect((await gateway.getCheckout({ sessionId: "cs_1", accountId: "acct_org" }))?.status).toBe(
      "open",
    );
  });

  it("finds out which way a session went when Stripe will not expire it", async () => {
    const refuse = () => {
      throw new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        message: "Only Checkout Sessions with a status in [open] can be expired.",
      });
    };
    const paid = stubClient({
      "sessions.expire": refuse,
      "sessions.retrieve": () => ({ id: "cs_1", status: "complete" }),
    });
    expect(await paid.gateway.expireCheckout({ sessionId: "cs_1", accountId: "acct_org" })).toBe(
      "complete",
    );

    const open = stubClient({ "sessions.expire": () => ({ id: "cs_1", status: "expired" }) });
    expect(await open.gateway.expireCheckout({ sessionId: "cs_1", accountId: "acct_org" })).toBe(
      "expired",
    );
  });

  it("opens accounts the organization controls and Stripe carries the losses for", async () => {
    const { calls, gateway } = stubClient({ "accounts.create": () => ({ id: "acct_new" }) });
    await gateway.createAccount({
      organizationId: "org1",
      name: "NGO",
      email: "a@b.test",
      country: "FI",
    });
    const [params, options] = calls[0]!.args as [Record<string, unknown>, Record<string, unknown>];
    expect(params.controller).toEqual({
      stripe_dashboard: { type: "full" },
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
    });
    expect(options).toEqual({ idempotencyKey: "org:org1:account" });
  });

  describe("notifications", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      account: "acct_org",
      data: {
        object: { id: "cs_1", object: "checkout.session", metadata: { order_id: "order-1" } },
      },
    });
    const { gateway } = stubClient({});

    it("are accepted with a valid signature and reduced to what matters", () => {
      const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
      expect(gateway.parseEvent(payload, header)).toMatchObject({
        id: "evt_1",
        type: "checkout.session.completed",
        accountId: "acct_org",
        checkoutSessionId: "cs_1",
        orderId: "order-1",
      });
    });

    it("are rejected when unsigned, signed with another secret, or altered", () => {
      const good = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
      const wrong = signer.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
      expect(() => gateway.parseEvent(payload, null)).toThrow();
      expect(() => gateway.parseEvent(payload, wrong)).toThrow();
      expect(() => gateway.parseEvent(payload.replace("order-1", "order-2"), good)).toThrow();
    });
  });
});
