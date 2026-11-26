/** Kept on order items so the fare eligibility follows the ticket after purchase. */
export function ticketLabel(name: string, ageGroup: string | null) {
  return ageGroup ? `${name} (${ageGroup})` : name;
}
