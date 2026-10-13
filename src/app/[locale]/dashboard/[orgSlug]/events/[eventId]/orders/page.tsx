import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgEvent } from "@/app/_lib/event";
import { pageResult } from "@/app/_lib/session";
import { formatMoney } from "@/domain/money/money";
import { OrderCard } from "@/features/orders/order-card";
import { getApp } from "@/server";
import { can } from "@/server/authz/permissions";
import { listEventOrders } from "@/server/modules/refunds/service";

type Props = { params: Promise<{ orgSlug: string; eventId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.orders");
  return { title: t("title") };
}

export default async function EventOrdersPage({ params }: Props) {
  const { orgSlug, eventId } = await params;
  const { ctx } = await requireOrgEvent(orgSlug, eventId);
  const orders = await pageResult(`/dashboard/${orgSlug}/events/${eventId}/orders`, () =>
    listEventOrders(getApp(), ctx, eventId),
  );
  const t = await getTranslations("events.orders");
  const locale = await getLocale();
  const canRefund = can(ctx.role, "order.refund");

  return (
    <>
      <h2 className="text-ink mb-3 text-lg font-semibold">{t("title")}</h2>
      {!canRefund ? <p className="text-muted mb-4 text-sm">{t("adminOnly")}</p> : null}
      {orders.length === 0 ? (
        <p className="text-muted text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => {
            const money = (amount: number) => formatMoney(amount, order.currency, locale);
            return (
              <li key={order.id}>
                <OrderCard
                  orgSlug={orgSlug}
                  canRefund={canRefund}
                  order={{
                    id: order.id,
                    reference: order.reference,
                    status: order.status,
                    buyerName: order.buyerName,
                    email: order.email,
                    currency: order.currency,
                    total: money(order.totalAmount),
                    refunded: order.refundedAmount > 0 ? money(order.refundedAmount) : null,
                    tickets: order.tickets.map((ticket) => ({
                      id: ticket.id,
                      description: ticket.description,
                      status: ticket.status,
                      checkedIn: ticket.checkedInAt !== null,
                      price: money(ticket.unitPriceAmount),
                      unitPriceAmount: ticket.unitPriceAmount,
                    })),
                    refunds: order.refunds.map((refund) => ({
                      id: refund.id,
                      amount: money(refund.amount),
                      status: refund.status,
                    })),
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
