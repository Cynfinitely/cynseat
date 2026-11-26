import { ticketLabel } from "@/domain/events/ticket-label";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { pickTranslation } from "@/domain/events/rules";
import { routing } from "@/i18n/routing";
import { getApp } from "@/server";
import { authorizeOrg } from "@/server/authz/authorize";
import { AppError } from "@/server/errors";
import { getOrgEvent } from "@/server/modules/events/service";
import { getOrgContext } from "@/server/modules/orgs/service";
import { ticketAdmission } from "@/server/modules/tickets/admission";
import { renderTicketsPdf } from "@/server/modules/tickets/pdf";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string; eventId: string }> },
): Promise<Response> {
  const { orgSlug, eventId } = await params;
  const query = new URL(request.url).searchParams;
  const requested = query.get("locale");
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const missing = () =>
    new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!z.uuid().safeParse(eventId).success) return missing();

  const app = getApp();
  try {
    const ctx = await getOrgContext(app.db, await app.resolveActor(request.headers), orgSlug);
    authorizeOrg(ctx, "event.manage");
    const {
      event,
      venue: draftVenue,
      translations,
      ticketTypes,
    } = await getOrgEvent(app, ctx, eventId);
    const type = ticketTypes.find((row) => row.id === query.get("type"));
    if (!type) return missing();

    const t = await getTranslations({ locale, namespace: "events" });
    const order = await getTranslations({ locale, namespace: "checkout.order" });
    const store = await getTranslations({ locale, namespace: "storefront.event" });
    const seat = await getTranslations({ locale, namespace: "seating.ticket" });
    const venue = event.venueSnapshot ?? draftVenue;
    const bytes = await renderTicketsPdf({
      eventTitle:
        pickTranslation(translations, locale, event.defaultLocale)?.title ?? t("list.untitled"),
      admission: await ticketAdmission(locale, event),
      when: new Intl.DateTimeFormat(locale, {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: event.timezone,
      }).format(event.startsAt),
      where: venue
        ? `${venue.name}, ${venue.addressLine1}, ${venue.city}`
        : event.isOnline
          ? store("online")
          : t("tickets.venuePending"),
      organizer: ctx.organization.name,
      reference: "DEMO",
      buyerName: t("tickets.sampleGuest"),
      tickets: [
        {
          description: ticketLabel(type.name, type.ageGroup),
          seat: type.kind === "seated" ? seat("seat", { section: "A", row: "1", seat: "1" }) : null,
          position: order("ticket", { number: 1, total: 1 }),
          code: "CynSeat preview only",
        },
      ],
      labels: {
        when: store("when"),
        where: store("where"),
        holder: order("pdfHolder"),
        order: order("pdfOrder"),
        organizer: order("pdfOrganizer"),
        show: t("tickets.previewNotice"),
      },
    });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="ticket-preview.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return missing();
    throw error;
  }
}
