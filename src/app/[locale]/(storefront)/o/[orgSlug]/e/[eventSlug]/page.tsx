import { CalendarDays, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { cache } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { SaleState } from "@/domain/events/rules";
import { formatMoney } from "@/domain/money/money";
import { TicketSelector } from "@/features/checkout/ticket-selector";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getApp } from "@/server";
import { getPublicEvent } from "@/server/modules/events/public";

type Props = { params: Promise<{ locale: Locale; orgSlug: string; eventSlug: string }> };

export const dynamic = "force-dynamic";

const load = cache((orgSlug: string, eventSlug: string, locale: Locale) =>
  getPublicEvent(getApp(), orgSlug, eventSlug, locale),
);

const stateTones: Record<SaleState, BadgeTone> = {
  on_sale: "success",
  sold_out: "danger",
  ended: "neutral",
  not_started: "warning",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, orgSlug, eventSlug } = await params;
  const event = await load(orgSlug, eventSlug, locale);
  if (!event) return {};
  return {
    title: event.title,
    description: event.summary ?? undefined,
    openGraph: {
      title: event.title,
      description: event.summary ?? undefined,
      images: event.coverImageUrl ? [event.coverImageUrl] : undefined,
    },
  };
}

export default async function EventPage({ params }: Props) {
  const { locale, orgSlug, eventSlug } = await params;
  const event = await load(orgSlug, eventSlug, locale);
  if (!event) notFound();
  const t = await getTranslations("storefront.event");
  const tCategories = await getTranslations("common.categories");
  const format = await getFormatter();
  const inZone = { timeZone: event.timezone } as const;
  const time = (date: Date) => format.dateTime(date, { timeStyle: "short", ...inZone });
  const contentLang = event.contentLocale === locale ? undefined : event.contentLocale;
  const onSale = event.ticketTypes.filter((type) => type.state === "on_sale");
  const paragraphs = (event.description ?? "").split(/\n\s*\n/).filter((p) => p.trim() !== "");

  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      {event.status === "cancelled" ? (
        <Alert tone="danger" title={t("cancelledTitle")} className="mb-6">
          {event.cancellationReason}
        </Alert>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {event.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- organizer uploads, sized by CSS
            <img
              src={event.coverImageUrl}
              alt=""
              className="mb-6 aspect-[16/9] w-full rounded-xl object-cover"
            />
          ) : null}
          <p className="text-brand-700 text-xs font-semibold tracking-wide uppercase">
            {tCategories(event.category)}
          </p>
          <h1
            className="text-ink mt-1 text-3xl font-semibold tracking-tight sm:text-4xl"
            lang={contentLang}
          >
            {event.title}
          </h1>
          <p className="text-muted mt-2">
            {t("by")}{" "}
            <Link
              href={`/o/${event.organization.slug}`}
              className="text-brand-700 font-medium underline"
            >
              {event.organization.name}
            </Link>
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3">
              <CalendarDays aria-hidden className="text-brand-600 mt-0.5 size-5 shrink-0" />
              <div>
                <h2 className="text-muted text-sm font-normal">{t("when")}</h2>
                <p className="text-ink font-medium">
                  {format.dateTime(event.startsAt, { dateStyle: "full", ...inZone })}
                  <br />
                  {time(event.startsAt)}
                  {event.endsAt ? ` (${t("until", { time: time(event.endsAt) })})` : ""}
                </p>
                {event.doorsAt ? (
                  <p className="text-muted text-sm">{t("doors", { time: time(event.doorsAt) })}</p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin aria-hidden className="text-brand-600 mt-0.5 size-5 shrink-0" />
              <div>
                <h2 className="text-muted text-sm font-normal">{t("where")}</h2>
                {event.venue ? (
                  <p className="text-ink font-medium">
                    {event.venue.name}
                    <br />
                    <span className="text-body font-normal">
                      {event.venue.addressLine1},{" "}
                      {event.venue.postalCode ? `${event.venue.postalCode} ` : ""}
                      {event.venue.city}
                    </span>
                  </p>
                ) : (
                  <p className="text-ink font-medium">{t("online")}</p>
                )}
              </div>
            </div>
          </div>

          {event.summary || paragraphs.length > 0 ? (
            <section aria-labelledby="about-title" className="mt-10">
              <h2 id="about-title" className="text-ink text-xl font-semibold">
                {t("about")}
              </h2>
              {contentLang ? <p className="text-muted mt-1 text-sm">{t("otherLanguage")}</p> : null}
              <div lang={contentLang} className="mt-3 max-w-prose space-y-4 leading-relaxed">
                {event.summary ? <p className="text-ink font-medium">{event.summary}</p> : null}
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside aria-labelledby="tickets-title">
          <Card className="p-5 lg:sticky lg:top-20">
            <h2 id="tickets-title" className="text-ink text-lg font-semibold">
              {t("tickets")}
            </h2>
            {event.ticketTypes.length === 0 ? (
              <p className="text-muted mt-3 text-sm">{t("noTickets")}</p>
            ) : (
              <ul className="divide-line mt-2 divide-y">
                {event.ticketTypes.map((type) => (
                  <li key={type.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-ink font-medium">{type.name}</p>
                      <p className="text-ink font-semibold whitespace-nowrap">
                        {type.priceAmount === 0
                          ? t("free")
                          : formatMoney(type.priceAmount, event.currency, locale)}
                      </p>
                    </div>
                    {type.description ? (
                      <p className="text-muted mt-0.5 text-sm">{type.description}</p>
                    ) : null}
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={stateTones[type.state]}>
                        {type.state === "not_started" && type.salesStartAt
                          ? t("state.not_started", {
                              date: format.dateTime(type.salesStartAt, {
                                dateStyle: "medium",
                                timeStyle: "short",
                                ...inZone,
                              }),
                            })
                          : t(`state.${type.state === "not_started" ? "ended" : type.state}`)}
                      </Badge>
                      {type.state === "on_sale" && type.remaining !== null ? (
                        <span className="text-danger font-medium">
                          {t("remaining", { count: type.remaining })}
                        </span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {event.status === "published" ? (
              <TicketSelector
                eventId={event.id}
                currency={event.currency}
                maxPerOrder={event.maxTicketsPerOrder}
                options={onSale.map((type) => ({
                  id: type.id,
                  name: type.name,
                  priceAmount: type.priceAmount,
                  // Never offer more than are left, when stock is low enough to be shown.
                  max: Math.min(type.maxPerOrder, type.remaining ?? type.maxPerOrder),
                }))}
              />
            ) : null}
            {event.contactEmail ? (
              <p className="text-muted mt-3 text-sm">
                {t("contact", { email: event.contactEmail })}
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
    </article>
  );
}
