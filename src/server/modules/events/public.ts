// What anyone on the internet may see: published events of approved organizations.
import {
  pickTranslation,
  remainingOf,
  saleStateOf,
  type SaleState,
} from "../../../domain/events/rules";
import type { ContentLocale, EventCategory } from "../../../domain/events/types";
import type { Db } from "../../db/client";
import type { VenueSnapshot } from "../../db/schema";
import type { Clock } from "../../ports/clock";
import * as repo from "./repo";

type Deps = { db: Db; clock: Clock };

export type PublicEventCard = {
  id: string;
  slug: string;
  organization: { slug: string; name: string };
  title: string;
  summary: string | null;
  /** Language the title and summary are actually in. */
  contentLocale: string;
  category: EventCategory;
  startsAt: Date;
  timezone: string;
  venue: VenueSnapshot | null;
  isOnline: boolean;
  coverImageUrl: string | null;
  currency: string;
  /** Cheapest ticket on offer, in minor units; null when there are no tickets. */
  fromPrice: number | null;
};

export type PublicTicketType = {
  id: string;
  /** "ga" is bought by number; "seated" by choosing seats on the map. */
  kind: "ga" | "seated";
  name: string;
  description: string | null;
  priceAmount: number;
  state: SaleState;
  /** Shown only when few are left. */
  remaining: number | null;
  salesStartAt: Date | null;
  maxPerOrder: number;
};

export type PublicEvent = PublicEventCard & {
  description: string | null;
  status: "published" | "cancelled";
  cancellationReason: string | null;
  endsAt: Date | null;
  doorsAt: Date | null;
  contactEmail: string | null;
  maxTicketsPerOrder: number;
  ticketTypes: PublicTicketType[];
};

export type PublicOrganization = {
  slug: string;
  name: string;
  description: string | null;
  website: string | null;
  contactEmail: string | null;
  events: PublicEventCard[];
};

type Joined = Awaited<ReturnType<typeof repo.findUpcomingPublicEvents>>[number];
type Details = Awaited<ReturnType<typeof repo.findPublicDetails>>;

function toCard(row: Joined, details: Details, locale: ContentLocale): PublicEventCard | null {
  const { event, organization } = row;
  const translation = pickTranslation(
    details.translations.filter((t) => t.eventId === event.id),
    locale,
    event.defaultLocale,
  );
  // An event with no content at all cannot be shown.
  if (!translation) return null;
  const prices = details.ticketTypes
    .filter((type) => type.eventId === event.id)
    .map((type) => type.priceAmount);

  return {
    id: event.id,
    slug: event.slug,
    organization: { slug: organization.slug, name: organization.name },
    title: translation.title,
    summary: translation.summary,
    contentLocale: translation.locale,
    category: event.category,
    startsAt: event.startsAt,
    timezone: event.timezone,
    venue: event.venueSnapshot,
    isOnline: event.isOnline,
    coverImageUrl: event.coverImageUrl,
    currency: event.currency,
    fromPrice: prices.length > 0 ? Math.min(...prices) : null,
  };
}

async function toCards(
  deps: Deps,
  rows: Joined[],
  locale: ContentLocale,
): Promise<PublicEventCard[]> {
  const details = await repo.findPublicDetails(
    deps.db,
    rows.map((row) => row.event.id),
  );
  return rows.flatMap((row) => toCard(row, details, locale) ?? []);
}

export async function listUpcomingEvents(
  deps: Deps,
  options: { locale: ContentLocale; limit?: number },
): Promise<PublicEventCard[]> {
  const rows = await repo.findUpcomingPublicEvents(deps.db, {
    now: deps.clock.now(),
    limit: options.limit ?? 24,
  });
  return toCards(deps, rows, options.locale);
}

export async function getPublicOrganization(
  deps: Deps,
  slug: string,
  locale: ContentLocale,
): Promise<PublicOrganization | null> {
  const org = await repo.findPublicOrganization(deps.db, slug);
  if (!org) return null;
  const rows = await repo.findUpcomingPublicEvents(deps.db, {
    now: deps.clock.now(),
    limit: 50,
    organizationSlug: slug,
  });
  return {
    slug: org.slug,
    name: org.name,
    description: org.description,
    website: org.website,
    contactEmail: org.contactEmail,
    events: await toCards(deps, rows, locale),
  };
}

const LOW_STOCK = 10;

export async function getPublicEvent(
  deps: Deps,
  organizationSlug: string,
  eventSlug: string,
  locale: ContentLocale,
): Promise<PublicEvent | null> {
  const row = await repo.findPublicEvent(deps.db, organizationSlug, eventSlug);
  if (!row) return null;
  const details = await repo.findPublicDetails(deps.db, [row.event.id]);
  const card = toCard(row, details, locale);
  if (!card) return null;

  const { event } = row;
  const now = deps.clock.now();
  const translation = pickTranslation(details.translations, locale, event.defaultLocale)!;

  return {
    ...card,
    description: translation.description,
    status: event.status === "cancelled" ? "cancelled" : "published",
    cancellationReason: event.cancellationReason,
    endsAt: event.endsAt,
    doorsAt: event.doorsAt,
    contactEmail: row.contactEmail,
    maxTicketsPerOrder: event.maxTicketsPerOrder,
    ticketTypes: details.ticketTypes.map((type) => {
      const remaining = remainingOf(type);
      return {
        id: type.id,
        kind: type.kind,
        name: type.name,
        description: type.description,
        priceAmount: type.priceAmount,
        state:
          event.status === "cancelled" || event.salesPaused
            ? "ended"
            : saleStateOf(type, event.startsAt, now),
        remaining: remaining !== null && remaining <= LOW_STOCK ? remaining : null,
        salesStartAt: type.salesStartAt,
        maxPerOrder: Math.min(
          type.maxPerOrder ?? event.maxTicketsPerOrder,
          event.maxTicketsPerOrder,
        ),
      };
    }),
  };
}

/** The little a checkout page needs to know about the event being bought. */
export async function getEventForCheckout(
  deps: Deps,
  eventId: string,
  locale: ContentLocale,
): Promise<{
  title: string;
  contentLocale: string;
  slug: string;
  organization: { slug: string; name: string };
} | null> {
  const row = await repo.findPublicEventById(deps.db, eventId);
  if (!row) return null;
  const details = await repo.findPublicDetails(deps.db, [eventId]);
  const translation = pickTranslation(details.translations, locale, row.event.defaultLocale);
  if (!translation) return null;
  return {
    title: translation.title,
    contentLocale: translation.locale,
    slug: row.event.slug,
    organization: { slug: row.organization.slug, name: row.organization.name },
  };
}
