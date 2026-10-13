"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/domain/money/money";
import { useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/lib/use-error-text";
import { refundOrderAction, retryRefundAction } from "./actions";

export type OrderCardData = {
  id: string;
  reference: string;
  status: string;
  buyerName: string;
  email: string;
  currency: string;
  /** Amounts arrive already formatted for the reader. */
  total: string;
  refunded: string | null;
  tickets: {
    id: string;
    description: string;
    status: "valid" | "void";
    checkedIn: boolean;
    price: string;
    /** What was paid for this ticket, in minor units. */
    unitPriceAmount: number;
  }[];
  refunds: { id: string; amount: string; status: string }[];
};

export function OrderCard({
  orgSlug,
  order,
  canRefund,
}: {
  orgSlug: string;
  order: OrderCardData;
  canRefund: boolean;
}) {
  const t = useTranslations("events.orders");
  const errorText = useErrorText();
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [restock, setRestock] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string }>();
  const refundable = order.tickets.filter((ticket) => ticket.status === "valid");

  async function run(action: () => ReturnType<typeof refundOrderAction>) {
    setPending(true);
    setMessage(undefined);
    const result = await action();
    setPending(false);
    setSelected([]);
    if (!result.ok) setMessage({ tone: "danger", text: errorText(result.reason) ?? "" });
    else if (result.data.status === "failed") {
      setMessage({ tone: "danger", text: t("failed", { reason: "—" }) });
    } else {
      setMessage({
        tone: result.data.status === "pending" ? "info" : "success",
        text: t(result.data.status === "pending" ? "pending" : "done"),
      });
    }
    router.refresh();
  }

  function refund(ticketIds: string[] | undefined) {
    if (ticketIds && ticketIds.length === 0) {
      return setMessage({ tone: "danger", text: t("selectFirst") });
    }
    // Quote exactly what will go back: what was paid for the tickets being refunded.
    const amount = refundable
      .filter((ticket) => !ticketIds || ticketIds.includes(ticket.id))
      .reduce((sum, ticket) => sum + ticket.unitPriceAmount, 0);
    const quoted = formatMoney(amount, order.currency, locale);
    if (!window.confirm(t("confirm", { amount: quoted, name: order.buyerName }))) return;
    void run(() => refundOrderAction(orgSlug, { orderId: order.id, ticketIds, restock }));
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-ink font-semibold">{t("order", { reference: order.reference })}</h2>
          <p className="text-muted text-sm">
            {t("buyer", { name: order.buyerName, email: order.email })}
          </p>
        </div>
        <p className="text-sm">
          <span className="text-ink font-semibold">{t("total", { total: order.total })}</span>
          {order.refunded ? (
            <span className="text-muted"> · {t("refunded", { amount: order.refunded })}</span>
          ) : null}
        </p>
      </div>

      {order.status === "unfulfillable" ? (
        <Alert tone="warning" className="mt-3">
          {t("unfulfillable")}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone={message.tone} className="mt-3">
          {message.text}
        </Alert>
      ) : null}

      <ul className="divide-line mt-3 divide-y text-sm">
        {order.tickets.map((ticket, index) => (
          <li key={ticket.id} className="flex items-center gap-3 py-2">
            {canRefund && ticket.status === "valid" ? (
              <input
                type="checkbox"
                className="accent-brand-600 size-4"
                aria-label={t("select", { description: ticket.description, number: index + 1 })}
                checked={selected.includes(ticket.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, ticket.id]
                      : selected.filter((id) => id !== ticket.id),
                  )
                }
              />
            ) : null}
            <span className="flex-1">
              {ticket.description} · {ticket.price}
            </span>
            {ticket.checkedIn ? <Badge>{t("checkedIn")}</Badge> : null}
            <Badge tone={ticket.status === "valid" ? "success" : "danger"}>
              {t(ticket.status)}
            </Badge>
          </li>
        ))}
      </ul>

      {order.refunds.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {order.refunds.map((refund) => (
            <li key={refund.id} className="flex flex-wrap items-center gap-2">
              <span
                className={refund.status === "failed" ? "text-danger font-medium" : "text-muted"}
              >
                {t(refund.status === "failed" ? "refundFailed" : "refundOk", {
                  amount: refund.amount,
                })}
              </span>
              {canRefund && refund.status === "failed" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => retryRefundAction(orgSlug, refund.id))}
                >
                  {t("retry")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canRefund && refundable.length > 0 ? (
        <div className="border-line mt-4 space-y-3 border-t pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand-600 size-4"
              checked={restock}
              onChange={(event) => setRestock(event.target.checked)}
            />
            {t("restock")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => refund(selected)}
            >
              {t("refundSelected")}
            </Button>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => refund(undefined)}>
              {t("refundAll")}
              <span className="sr-only"> {order.reference}</span>
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
