/** Every way a scan at the door can end. */
export const scanResults = [
  /** Let them in. */
  "accepted",
  /** This ticket has already been used. */
  "duplicate",
  /** Refunded or cancelled. */
  "void",
  /** A real CynSeat ticket, but for a different event. */
  "wrong_event",
  /** Not a ticket we know: unknown, forged, or another organization's. */
  "not_found",
] as const;
export type ScanResult = (typeof scanResults)[number];
