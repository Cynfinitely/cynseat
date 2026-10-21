import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { requireUserOrRedirect } from "@/app/_lib/session";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getApp } from "@/server";
import { claimGuestOrders, listOrdersOfUser } from "@/server/modules/checkout/service";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.orders");
  return { title: t("title"), robots: { index: false } };
}

export default async function AccountOrdersPage() {
  const actor = await requireUserOrRedirect("/account/orders");
  const app = getApp();
  // Orders bought as a guest with this (now proven) address join the account.
  await claimGuestOrders(app, actor);
  const orders = await listOrdersOfUser(app, actor.userId, await getLocale());
  const t = await getTranslations("account.orders");
  const format = await getFormatter();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      {!actor.emailVerified ? (
        <Alert tone="warning" className="mt-6">
          {t("verify")}
        </Alert>
      ) : null}
      {orders.length === 0 ? (
        <Card className="mt-6 p-8 text-center">
          <p className="text-ink font-semibold">{t("empty")}</p>
          <p className="text-muted mt-2 text-sm">{t("emptyHint", { email: actor.email })}</p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => (
            <li key={order.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <h2 className="text-ink font-semibold">{order.event.title}</h2>
                  <p className="text-sm">
                    {format.dateTime(order.event.startsAt, {
                      dateStyle: "full",
                      timeStyle: "short",
                      timeZone: order.event.timezone,
                    })}
                  </p>
                  <p className="text-muted text-sm">
                    {t("order", { reference: order.reference })} ·{" "}
                    {t("tickets", {
                      count: order.tickets.filter((ticket) => ticket.status === "valid").length,
                    })}
                  </p>
                </div>
                <Link
                  href={`/orders/${order.accessToken}`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {t("open")}
                  <span className="sr-only">: {order.event.title}</span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
