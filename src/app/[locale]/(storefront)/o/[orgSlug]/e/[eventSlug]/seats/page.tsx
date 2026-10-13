import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getBuyer } from "@/app/_lib/buyer";
import { SeatPicker } from "@/features/seating/seat-picker";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getApp } from "@/server";
import { getPublicEvent } from "@/server/modules/events/public";
import { getCart } from "@/server/modules/inventory/service";
import { getPublicSeating } from "@/server/modules/seatmaps/service";

type Props = { params: Promise<{ locale: Locale; orgSlug: string; eventSlug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seating.picker");
  return { title: t("title"), robots: { index: false } };
}

export default async function SeatsPage({ params }: Props) {
  const { locale, orgSlug, eventSlug } = await params;
  const app = getApp();
  const event = await getPublicEvent(app, orgSlug, eventSlug, locale);
  const seating = event?.status === "published" ? await getPublicSeating(app.db, event.id) : null;
  if (!event || !seating) notFound();

  const buyer = await getBuyer();
  const cart = buyer ? await getCart(app, buyer, event.id) : null;
  const t = await getTranslations("seating.picker");
  const eventPath = `/o/${orgSlug}/e/${eventSlug}`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm">
        <Link href={eventPath} className="text-muted hover:text-ink underline">
          {t("back")}
        </Link>
      </p>
      <h1 className="text-ink mt-2 text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-1" lang={event.contentLocale}>
        {event.title}
      </p>
      <p className="text-muted mt-2 mb-6 text-sm">{t("intro")}</p>
      <SeatPicker
        eventId={event.id}
        currency={event.currency}
        maxPerOrder={event.maxTicketsPerOrder}
        layout={seating.layout}
        sections={seating.sections.map(({ id, name, ticketTypes }) => ({ id, name, ticketTypes }))}
        seats={seating.seats}
        initialSelection={Object.fromEntries(
          // Only while still choosing; a cart that has gone to payment is left alone.
          (cart?.phase === "cart" ? cart.seats : []).map((seat) => [
            seat.seatId,
            seat.ticketTypeId,
          ]),
        )}
      />
    </div>
  );
}
