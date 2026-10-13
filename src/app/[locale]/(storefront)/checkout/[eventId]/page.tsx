import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getBuyer } from "@/app/_lib/buyer";
import { getActor } from "@/app/_lib/session";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/domain/money/money";
import { CheckoutForm } from "@/features/checkout/checkout-form";
import { HoldCountdown } from "@/features/checkout/hold-countdown";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getApp } from "@/server";
import { getEventForCheckout } from "@/server/modules/events/public";
import { getCart } from "@/server/modules/inventory/service";

type Props = {
  params: Promise<{ locale: Locale; eventId: string }>;
  searchParams: Promise<{ cancelled?: string }>;
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ locale, eventId }, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations("checkout.page");
  const app = getApp();
  const buyer = await getBuyer();
  const event = UUID.test(eventId) ? await getEventForCheckout(app, eventId, locale) : null;
  const cart = buyer && event ? await getCart(app, buyer, eventId) : null;
  const eventPath = event ? `/o/${event.organization.slug}/e/${event.slug}` : "/";

  if (!event || !cart) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-20 text-center">
        <h1 className="text-ink text-2xl font-semibold tracking-tight">{t("emptyTitle")}</h1>
        <p className="text-muted mt-3">{t("emptyBody")}</p>
        <Link href={eventPath} className={buttonVariants({ className: "mt-8" })}>
          {t("back")}
        </Link>
      </div>
    );
  }

  const actor = await getActor();
  const money = (amount: number) => formatMoney(amount, cart.currency, locale);
  const secondsLeft = Math.max(
    0,
    Math.round((cart.expiresAt.getTime() - app.clock.now().getTime()) / 1000),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-1" lang={event.contentLocale}>
        {event.title}
      </p>

      <div className="mt-6 space-y-4">
        {query.cancelled ? <Alert tone="warning">{t("cancelled")}</Alert> : null}
        <HoldCountdown secondsLeft={secondsLeft} />
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
        <CheckoutForm
          eventId={eventId}
          eventPath={eventPath}
          paying={cart.phase === "checkout"}
          submitLabel={
            cart.totalAmount === 0 ? t("getTickets") : t("pay", { total: money(cart.totalAmount) })
          }
          defaults={{
            email: actor.kind === "user" ? actor.email : "",
            name: actor.kind === "user" ? actor.name : "",
          }}
        />
        <Card className="h-fit p-5">
          <h2 className="text-ink font-semibold">{t("summary")}</h2>
          <ul className="divide-line mt-2 divide-y text-sm">
            {cart.lines.map((line) => (
              <li key={line.ticketTypeId} className="flex justify-between gap-3 py-2">
                <span>
                  {line.quantity} × {line.name}
                </span>
                <span className="whitespace-nowrap">
                  {line.unitPriceAmount === 0
                    ? t("free")
                    : money(line.unitPriceAmount * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink border-line mt-2 flex justify-between border-t pt-3 font-semibold">
            <span>{(await getTranslations("checkout.selector"))("total")}</span>
            <span>{money(cart.totalAmount)}</span>
          </p>
          <p className="text-muted mt-3 text-xs">
            {t("terms", { organization: event.organization.name })}
          </p>
        </Card>
      </div>
    </div>
  );
}
