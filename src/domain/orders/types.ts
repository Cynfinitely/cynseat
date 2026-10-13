export const holdStatuses = ["active", "converted", "released", "expired"] as const;
export type HoldStatus = (typeof holdStatuses)[number];

/** A cart hold is short; once the buyer goes to pay it is extended to outlive the payment page. */
export const holdPhases = ["cart", "checkout"] as const;
export type HoldPhase = (typeof holdPhases)[number];

export const orderStatuses = ["pending", "paid", "expired", "cancelled", "unfulfillable"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const paymentProviders = ["stripe", "none"] as const;
export type PaymentProvider = (typeof paymentProviders)[number];

export const ticketStatuses = ["valid", "void"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

/** How long tickets stay reserved while the buyer fills in the cart. */
export const CART_HOLD_SECONDS = 10 * 60;
/** Payment pages stay open this long (the shortest Stripe allows is 30 minutes). */
export const CHECKOUT_SESSION_SECONDS = 31 * 60;
/** Extra time a hold outlives its payment page, to absorb a late payment notification. */
export const CHECKOUT_GRACE_SECONDS = 5 * 60;
/** Free tickets one email address may take for one event. */
export const FREE_TICKETS_PER_EMAIL = 10;
