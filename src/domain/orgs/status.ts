/** Where an organization stands with CynSeat's platform review. */
export const approvalStatuses = ["pending", "approved", "rejected", "suspended"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];
