// components/CheckoutButton.tsx

import { loadStripe } from "@stripe/stripe-js";
import { useTranslation } from "react-i18next";
import { useState } from "react";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export default function CheckoutButton() {
  const { t } = useTranslation();
  const [numTickets, setNumTickets] = useState(1);
  const [loading, setLoading] = useState(false);
  const ticketPrice = 5;

  const handleClick = async () => {
    setLoading(true);
    const stripe = await stripePromise;
    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        numTickets,
        totalCost,
        metadata: { numTickets: numTickets.toString() },
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const session = await res.json();
    if (stripe) {
      const result = await stripe.redirectToCheckout({
        sessionId: session.sessionId,
      });
      if (result.error) {
        alert(result.error.message);
      }
    }
    setLoading(false);
  };

  const handleAddTicket = () => {
    setNumTickets(numTickets + 1);
  };

  const handleRemoveTicket = () => {
    if (numTickets > 1) {
      setNumTickets(numTickets - 1);
    }
  };

  const totalCost = numTickets * ticketPrice;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
      {/* Ticket Counter */}
      <div className="flex items-center bg-white rounded-lg shadow-md border-2 border-gray-200 p-2">
        <button
          onClick={handleRemoveTicket}
          disabled={numTickets <= 1}
          className="w-10 h-10 flex items-center justify-center text-white text-xl font-bold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500">
          −
        </button>
        <div className="mx-4 min-w-[80px] text-center">
          <div className="text-2xl font-bold text-gray-800">{numTickets}</div>
          <div className="text-xs text-gray-500">
            {numTickets === 1 ? t("ticket") : t("tickets")}
          </div>
        </div>
        <button
          onClick={handleAddTicket}
          className="w-10 h-10 flex items-center justify-center text-white text-xl font-bold bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500">
          +
        </button>
      </div>

      {/* Price Display */}
      <div className="flex items-center bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg px-6 py-3 border-2 border-purple-200">
        <span className="text-xl mr-2">💰</span>
        <div className="text-left">
          <div className="text-xs text-gray-600 font-medium">{t("total")}</div>
          <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
            €{totalCost}
          </div>
        </div>
      </div>

      {/* Buy Button */}
      <button
        role="link"
        onClick={handleClick}
        disabled={loading}
        className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-lg hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            <span>{t("processing")}</span>
          </div>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <span>🎫</span>
            <span>{t("buyTicket")}</span>
          </span>
        )}
      </button>
    </div>
  );
}
