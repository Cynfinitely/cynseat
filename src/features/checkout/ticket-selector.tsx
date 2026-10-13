"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { formatMoney } from "@/domain/money/money";
import { useRouter } from "@/i18n/navigation";
import { setCartAction } from "./actions";
import { useCheckoutErrorText } from "./use-checkout-error";

type Option = { id: string; name: string; priceAmount: number; max: number };

/** Quantity pickers for the ticket types that are on sale, and the way into checkout. */
export function TicketSelector({
  eventId,
  currency,
  maxPerOrder,
  options,
}: {
  eventId: string;
  currency: string;
  maxPerOrder: number;
  options: Option[];
}) {
  const t = useTranslations("checkout.selector");
  const errorText = useCheckoutErrorText();
  const locale = useLocale();
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const count = options.reduce((sum, option) => sum + (quantities[option.id] ?? 0), 0);
  const total = options.reduce(
    (sum, option) => sum + (quantities[option.id] ?? 0) * option.priceAmount,
    0,
  );

  async function submit() {
    if (count === 0) return setError(t("none"));
    if (count > maxPerOrder) return setError(t("max", { max: maxPerOrder }));
    setPending(true);
    setError(undefined);
    const result = await setCartAction({
      eventId,
      lines: options.map((option) => ({
        ticketTypeId: option.id,
        quantity: quantities[option.id] ?? 0,
      })),
    });
    if (!result.ok) {
      setPending(false);
      setError(errorText(result));
      router.refresh();
      return;
    }
    router.push(`/checkout/${eventId}`);
  }

  // Stays mounted with nothing on sale, so a buyer who just lost the last ticket still
  // sees why their request failed.
  if (options.length === 0) {
    return error ? (
      <Alert tone="danger" className="mt-3">
        {error}
      </Alert>
    ) : null;
  }

  return (
    <form
      className="border-line mt-2 space-y-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {options.map((option) => (
        <div key={option.id} className="flex items-center justify-between gap-3">
          <label htmlFor={`qty-${option.id}`} className="text-ink text-sm font-medium">
            {option.name}
            <span className="sr-only"> ({t("quantity", { name: option.name })})</span>
          </label>
          <Select
            id={`qty-${option.id}`}
            className="w-20 py-1.5"
            value={quantities[option.id] ?? 0}
            onChange={(event) =>
              setQuantities({ ...quantities, [option.id]: Number(event.target.value) })
            }
          >
            {Array.from({ length: option.max + 1 }, (_, quantity) => (
              <option key={quantity} value={quantity}>
                {quantity}
              </option>
            ))}
          </Select>
        </div>
      ))}
      <p className="text-ink flex justify-between font-semibold" aria-live="polite">
        <span>{t("total")}</span>
        <span>{formatMoney(total, currency, locale)}</span>
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {t("continue")}
      </Button>
    </form>
  );
}
