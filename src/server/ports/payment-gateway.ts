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

export type PaymentGateway = {
  /** Opens a hosted payment page. Repeating the call for the same order returns the same page. */
  createCheckout(request: CheckoutRequest): Promise<{ id: string; url: string }>;
  getCheckout(input: { sessionId: string; accountId: string }): Promise<CheckoutState | null>;
  /**
   * Closes an unpaid payment page so it can no longer be paid.
   * Returns the state it ended in: "complete" means the buyer paid first.
   */
  expireCheckout(input: { sessionId: string; accountId: string }): Promise<"expired" | "complete">;
};
