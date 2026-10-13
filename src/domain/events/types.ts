export const eventStatuses = ["draft", "published", "cancelled"] as const;
export type EventStatus = (typeof eventStatuses)[number];

export const eventVisibilities = ["public", "unlisted"] as const;
export type EventVisibility = (typeof eventVisibilities)[number];

export const eventCategories = [
  "music",
  "theatre",
  "film",
  "sports",
  "festival",
  "conference",
  "workshop",
  "community",
  "other",
] as const;
export type EventCategory = (typeof eventCategories)[number];

export const contentLocales = ["en", "fi", "tr"] as const;
export type ContentLocale = (typeof contentLocales)[number];

export function isContentLocale(value: string): value is ContentLocale {
  return (contentLocales as readonly string[]).includes(value);
}

export const ticketKinds = ["ga", "seated"] as const;
export type TicketKind = (typeof ticketKinds)[number];

export const venueStatuses = ["active", "hidden", "merged"] as const;
export type VenueStatus = (typeof venueStatuses)[number];

/** What stops an event from being published. Each is shown as a checklist item. */
export const publishProblems = [
  "org_not_approved",
  "missing_title",
  "missing_venue",
  "starts_in_past",
  "no_ticket_types",
] as const;
export type PublishProblem = (typeof publishProblems)[number];

export const MAX_TICKETS_PER_ORDER_LIMIT = 50;
