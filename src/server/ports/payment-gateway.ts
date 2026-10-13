export type CheckoutLine = { name: string; unitAmount: number; quantity: number };

export type CheckoutRequest = {
  orderId: string;
  /** The organization's payment account that is charging the buyer. */
  accountId: string;
  currency: string;
  lines: CheckoutLine[];
  /** CynSeat's share, taken from the organization's proceeds. */
  applicationFeeAmount: number;
  customerEmail: string;
  locale: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};

export type CheckoutState = {
  id: string;
  accountId: string;
  orderId: string | null;
  status: "open" | "complete" | "expired";
  /** True only when the money has actually been collected. */
  paid: boolean;
  amountTotal: number;
  currency: string;
  paymentIntentId: string | null;
  /** Where to send the buyer to pay, while the session is open. */
  url: string | null;
};

export type AccountState = {
  id: string;
  /** Whether the account can take payments right now. */
  chargesEnabled: boolean;
  /** Whether the organization has finished the provider's onboarding form. */
  detailsSubmitted: boolean;
};

/** A provider notification, reduced to what CynSeat acts on. */
export type GatewayEvent = {
  id: string;
  type: string;
  /** The connected account the event is about, when there is one. */
  accountId: string | null;
  /** Set for payment-page events. */
  checkoutSessionId: string | null;
  orderId: string | null;
  payload: Record<string, unknown>;
};

export type PaymentGateway = {
  /** Opens a payment account for an organization. Money for its tickets goes there. */
  createAccount(input: {
    organizationId: string;
    name: string;
    email: string;
    country: string;
  }): Promise<{ id: string }>;
  /** A one-time link where the organization completes the provider's onboarding. */
  createOnboardingLink(input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string }>;
  getAccount(accountId: string): Promise<AccountState | null>;
  /**
   * Checks that a notification really comes from the provider and decodes it.
   * Throws if the signature does not verify.
   */
  parseEvent(rawBody: string, signature: string | null): GatewayEvent;

  /** Opens a hosted payment page. Repeating the call for the same order returns the same page. */
  createCheckout(request: CheckoutRequest): Promise<{ id: string; url: string }>;
  getCheckout(input: { sessionId: string; accountId: string }): Promise<CheckoutState | null>;
  /**
   * Closes an unpaid payment page so it can no longer be paid.
   * Returns the state it ended in: "complete" means the buyer paid first.
   */
  expireCheckout(input: { sessionId: string; accountId: string }): Promise<"expired" | "complete">;
};
