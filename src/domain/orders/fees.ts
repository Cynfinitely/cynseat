export type FeeRule = {
  /** Share of the order total, in hundredths of a percent (250 = 2.5%). */
  bps: number;
  /** Fixed amount per ticket, in minor units. */
  fixedMinor: number;
};

export const NO_FEE: FeeRule = { bps: 0, fixedMinor: 0 };

/**
 * CynSeat's fee on an order, in minor units. Integer arithmetic throughout, rounded half
 * up, and never more than the order itself. Free orders carry no fee.
 */
export function applicationFee(totalAmount: number, ticketCount: number, rule: FeeRule): number {
  if (totalAmount <= 0) return 0;
  const percentage = Math.floor((totalAmount * rule.bps + 5000) / 10_000);
  return Math.min(totalAmount, percentage + rule.fixedMinor * ticketCount);
}
