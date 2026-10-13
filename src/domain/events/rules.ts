import type { ContentLocale, PublishProblem } from "./types";

/** Everything that still stops an event from going public, in the order to fix it. */
export function publishProblemsFor(input: {
  orgApproved: boolean;
  hasDefaultTitle: boolean;
  hasPlace: boolean;
  startsAt: Date;
  now: Date;
  activeTicketTypes: number;
}): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (!input.orgApproved) problems.push("org_not_approved");
  if (!input.hasDefaultTitle) problems.push("missing_title");
  if (!input.hasPlace) problems.push("missing_venue");
  if (input.startsAt.getTime() <= input.now.getTime()) problems.push("starts_in_past");
  if (input.activeTicketTypes < 1) problems.push("no_ticket_types");
  return problems;
}

/**
 * The translation to show a reader: their language, else the event's own default,
 * else whatever exists. `locale` on the result says which one was used.
 */
export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  requested: ContentLocale,
  defaultLocale: string,
): T | undefined {
  return (
    translations.find((row) => row.locale === requested) ??
    translations.find((row) => row.locale === defaultLocale) ??
    translations[0]
  );
}

export type SaleState = "not_started" | "on_sale" | "ended" | "sold_out";

/** Whether a ticket type can be bought right now. */
export function saleStateOf(
  type: {
    capacity: number | null;
    qtySold: number;
    qtyHeld: number;
    salesStartAt: Date | null;
    salesEndAt: Date | null;
  },
  eventStartsAt: Date,
  now: Date,
): SaleState {
  const ends = type.salesEndAt ?? eventStartsAt;
  if (now.getTime() >= ends.getTime()) return "ended";
  if (type.salesStartAt && now.getTime() < type.salesStartAt.getTime()) return "not_started";
  if (type.capacity !== null && type.qtySold + type.qtyHeld >= type.capacity) return "sold_out";
  return "on_sale";
}

export function remainingOf(type: {
  capacity: number | null;
  qtySold: number;
  qtyHeld: number;
}): number | null {
  return type.capacity === null ? null : Math.max(0, type.capacity - type.qtySold - type.qtyHeld);
}
