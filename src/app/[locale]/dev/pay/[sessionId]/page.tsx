import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/domain/money/money";
import { settleFakePaymentAction } from "@/features/checkout/fake-pay-actions";
import { getFakeGateway } from "@/server";

type Props = { params: Promise<{ sessionId: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

/** Stands in for the payment provider's hosted page. Exists only with PAYMENTS_DRIVER=fake. */
export default async function FakePayPage({ params }: Props) {
  const { sessionId } = await params;
  const session = getFakeGateway()?.sessions.get(sessionId);
  if (!session || session.status !== "open") notFound();
  const t = await getTranslations("checkout.fake");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <Alert tone="warning" className="mt-4">
        {t("body")}
      </Alert>
      <Card className="mt-6 p-5">
        <ul className="text-sm">
          {session.request.lines.map((line) => (
            <li key={line.name} className="flex justify-between py-1">
              <span>
                {line.quantity} × {line.name}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink border-line mt-2 flex justify-between border-t pt-3 font-semibold">
          <span>{t("amount")}</span>
          <span>{formatMoney(session.amountTotal, session.currency, await getLocale())}</span>
        </p>
      </Card>
      <div className="mt-6 flex gap-3">
        <form action={settleFakePaymentAction.bind(null, sessionId, true)}>
          <Button type="submit">{t("pay")}</Button>
        </form>
        <form action={settleFakePaymentAction.bind(null, sessionId, false)}>
          <Button type="submit" variant="secondary">
            {t("cancel")}
          </Button>
        </form>
      </div>
    </div>
  );
}
