import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getApp } from "@/server";
import { getOrderByToken } from "@/server/modules/checkout/service";
import { renderTicketsPdf } from "@/server/modules/tickets/pdf";

export const dynamic = "force-dynamic";

/** The valid tickets of an order as a PDF. The order link's secret is the only credential. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const requested = new URL(request.url).searchParams.get("locale");
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const order = await getOrderByToken(getApp(), (await params).token, locale);
  const valid = order?.tickets.filter((ticket) => ticket.code !== null) ?? [];
  if (!order || order.status !== "paid" || valid.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const t = await getTranslations({ locale, namespace: "checkout.order" });
  const tStore = await getTranslations({ locale, namespace: "storefront.event" });
  const tSeat = await getTranslations({ locale, namespace: "seating.ticket" });
  const { event } = order;

  const bytes = await renderTicketsPdf({
    eventTitle: event.title,
    when: new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: event.timezone,
    }).format(event.startsAt),
    where: event.venue
      ? `${event.venue.name}, ${event.venue.addressLine1}, ${event.venue.city}`
      : tStore("online"),
    organizer: event.organization.name,
    reference: order.reference,
    buyerName: order.buyerName,
    tickets: valid.map((ticket) => ({
      description: ticket.description,
      seat: ticket.seat ? tSeat("seat", ticket.seat) : null,
      position: t("ticket", { number: ticket.number, total: order.tickets.length }),
      code: ticket.code!,
    })),
    labels: {
      when: tStore("when"),
      where: tStore("where"),
      holder: t("pdfHolder"),
      order: t("pdfOrder"),
      organizer: t("pdfOrganizer"),
      show: t("show"),
    },
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tickets-${order.reference}.pdf"`,
      // Tickets can be refunded or checked in at any time: never serve a stale copy.
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
