import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_TICKETS_PER_PURCHASE, TICKET_PRICE_EUR } from "../lib/constants";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type CheckoutButtonProps = {
  remainingSeats?: number | null;
};

export default function CheckoutButton({ remainingSeats }: CheckoutButtonProps) {
  const { t } = useTranslation();
  const [numTickets, setNumTickets] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxAllowed = Math.max(
    1,
    Math.min(MAX_TICKETS_PER_PURCHASE, remainingSeats ?? MAX_TICKETS_PER_PURCHASE)
  );
  const totalCost = numTickets * TICKET_PRICE_EUR;
  const soldOut = remainingSeats === 0;

  useEffect(() => {
    setNumTickets((count) => Math.min(count, maxAllowed));
  }, [maxAllowed]);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const stripe = await stripePromise;
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({
          numTickets,
          eventName: t("about.title"),
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const session = await res.json();
      if (!res.ok || !session.sessionId) {
        setError(session.error || t("checkoutError"));
        return;
      }
      if (stripe) {
        const result = await stripe.redirectToCheckout({
          sessionId: session.sessionId,
        });
        if (result.error) {
          setError(result.error.message || t("checkoutError"));
        }
      }
    } catch {
      setError(t("checkoutError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center rounded-md border border-gray-200">
          <button
            type="button"
            onClick={() => setNumTickets((count) => Math.max(1, count - 1))}
            disabled={numTickets <= 1 || soldOut}
            className="btn-ghost h-11 w-11"
            aria-label="-"
          >
            −
          </button>
          <div className="min-w-[4.5rem] px-2 text-center">
            <div className="text-lg font-semibold">{numTickets}</div>
            <div className="text-xs text-gray-500">
              {numTickets === 1 ? t("ticket") : t("tickets")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNumTickets((count) => Math.min(maxAllowed, count + 1))}
            disabled={numTickets >= maxAllowed || soldOut}
            className="btn-ghost h-11 w-11"
            aria-label="+"
          >
            +
          </button>
        </div>

        <div>
          <p className="text-sm text-gray-500">{t("unitPrice", { price: TICKET_PRICE_EUR })}</p>
          <p className="text-xl font-semibold text-gray-900">
            {t("total")}: €{totalCost}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading || soldOut}
        className="btn-primary w-full sm:w-auto"
      >
        {loading ? t("processing") : soldOut ? t("noTicketsFound") : t("buyTickets")}
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
