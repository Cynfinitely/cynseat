import { CalendarDays, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { QrCode } from "@/components/qr-code";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/domain/money/money";
import { RefreshUntilSettled } from "@/features/checkout/refresh-until-settled";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getApp } from "@/server";
import { getOrderByToken } from "@/server/modules/checkout/service";

type Props = { params: Promise<{ locale: Locale; token: string }> };

export const dynamic = "force-dynamic";
// The address is the key to the tickets: keep it out of search engines and referrers.
export const metadata: Metadata = { robots: { index: false }, referrer: "no-referrer" };

export default async function OrderPage({ params }: Props) {
  const { locale, token } = await params;
  const order = await getOrderByToken(getApp(), token, locale);
  const t = await getTranslations("checkout.order");
  const tStore = await getTranslations("storefront.event");

  if (!order) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-20 text-center">
        <h1 className="text-ink text-2xl font-semibold tracking-tight">{t("notFoundTitle")}</h1>
        <p className="text-muted mt-3">{t("notFoundBody")}</p>
      </div>
    );
  }

  const format = await getFormatter();
  const { event } = order;
  const eventPath = `/o/${event.organization.slug}/e/${event.slug}`;
  const contentLang = event.contentLocale === locale ? undefined : event.contentLocale;
  const money = (amount: number) => formatMoney(amount, order.currency, locale);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">
        {t("title", { reference: order.reference })}
      </h1>

      {order.status === "pending" ? (
        <>
          <RefreshUntilSettled />
          <Alert title={t("pendingTitle")} className="mt-6">
            {t("pendingBody")}
          </Alert>
        </>
      ) : null}
      {order.status === "expired" || order.status === "cancelled" ? (
        <div className="mt-6 space-y-4">
          <Alert tone="warning" title={t("expiredTitle")}>
            {t("expiredBody")}
          </Alert>
          <Link href={eventPath} className={buttonVariants({ variant: "secondary" })}>
            {(await getTranslations("checkout.page"))("back")}
          </Link>
        </div>
      ) : null}
      {order.status === "unfulfillable" ? (
        <Alert tone="danger" title={t("unfulfillableTitle")} className="mt-6">
          {t("unfulfillableBody")}
        </Alert>
      ) : null}

      {order.status === "paid" ? (
        <>
          <p className="text-muted mt-2">
            {t("thanks", { name: order.buyerName })} {t("sentTo", { email: order.email })}
          </p>
          {event.status === "cancelled" ? (
            <Alert tone="danger" className="mt-6">
              {t("eventCancelled")}
            </Alert>
          ) : null}

          <Card className="mt-6 p-5">
            <h2 className="text-ink text-xl font-semibold" lang={contentLang}>
              <Link href={eventPath} className="hover:underline">
                {event.title}
              </Link>
            </h2>
            <p className="mt-3 flex items-start gap-2 text-sm">
              <CalendarDays aria-hidden className="text-brand-600 mt-0.5 size-4 shrink-0" />
              <span>
                {format.dateTime(event.startsAt, {
                  dateStyle: "full",
                  timeStyle: "short",
                  timeZone: event.timezone,
                })}
                {event.doorsAt
                  ? ` · ${tStore("doors", {
                      time: format.dateTime(event.doorsAt, {
                        timeStyle: "short",
                        timeZone: event.timezone,
                      }),
                    })}`
                  : ""}
              </span>
            </p>
            <p className="mt-1.5 flex items-start gap-2 text-sm">
              <MapPin aria-hidden className="text-brand-600 mt-0.5 size-4 shrink-0" />
              <span>
                {event.venue
                  ? `${event.venue.name}, ${event.venue.addressLine1}, ${event.venue.city}`
                  : tStore("online")}
              </span>
            </p>
          </Card>

          <section aria-labelledby="tickets-title" className="mt-8">
            <h2 id="tickets-title" className="text-ink text-xl font-semibold">
              {t("tickets")}
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {order.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Card className="flex h-full flex-col items-center gap-3 p-5 text-center">
                    <p className="text-ink font-semibold">{ticket.description}</p>
                    <p className="text-muted text-sm">
                      {t("ticket", { number: ticket.number, total: order.tickets.length })}
                    </p>
                    {ticket.code ? (
                      <>
                        <QrCode value={ticket.code} label={t("qrAlt", { number: ticket.number })} />
                        <p className="text-muted text-sm">
                          {ticket.checkedInAt ? t("checkedIn") : t("show")}
                        </p>
                      </>
                    ) : (
                      <p className="text-danger text-sm font-medium">{t("void")}</p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="summary-title" className="mt-8 max-w-md">
            <h2 id="summary-title" className="text-ink text-xl font-semibold">
              {t("summary")}
            </h2>
            <ul className="divide-line mt-2 divide-y text-sm">
              {order.items.map((item) => (
                <li key={item.description} className="flex justify-between gap-3 py-2">
                  <span>
                    {item.quantity} × {item.description}
                  </span>
                  <span>{money(item.lineTotalAmount)}</span>
                </li>
              ))}
            </ul>
            <p className="text-ink border-line flex justify-between border-t pt-3 font-semibold">
              <span>{t("total")}</span>
              <span>{money(order.totalAmount)}</span>
            </p>
            {order.refundedAmount > 0 ? (
              <p className="text-muted mt-2 text-sm">
                {t("refunded", { amount: money(order.refundedAmount) })}
              </p>
            ) : null}
            {event.contactEmail ? (
              <p className="text-muted mt-4 text-sm">
                {tStore("contact", { email: event.contactEmail })}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
