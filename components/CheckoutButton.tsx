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
  const ticketPrice = 15;

  const calculateTotalCost = (numTickets: number) => {
    if (numTickets < 4) {
      return numTickets * ticketPrice;
    } else if (numTickets === 4) {
      return 50;
    } else if (numTickets === 5) {
      return 60;
    } else if (numTickets >= 6) {
      return 70;
    }
  };

  const handleClick = async () => {
    const stripe = await stripePromise;
    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        numTickets,
        totalCost,
        metadata: { numTickets: numTickets.toString() }, // Include numTickets in metadata
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
  };

  // Add a button to increment the number of tickets
  const handleAddTicket = () => {
    setNumTickets(numTickets + 1);
  };

  // Add a button to decrement the number of tickets
  const handleRemoveTicket = () => {
    if (numTickets > 1) {
      setNumTickets(numTickets - 1);
    }
  };

  const totalCost = calculateTotalCost(numTickets);

  return (
    <div className="flex items-center">
      <button
        onClick={handleAddTicket}
        className="focus:outline-black text-white text-sm py-2.5 px-4 border-b-4 border-green-600 bg-green-500 hover:bg-green-400"
      >
        +
      </button>
      <span className="mx-4 text-lg">{numTickets}</span>
      <button
        onClick={handleRemoveTicket}
        className="focus:outline-black text-white text-sm py-2.5 px-4 border-b-4 border-red-600 bg-red-500 hover:bg-red-400"
      >
        -
      </button>
      <span className="mx-4 text-lg">€{totalCost}</span>
      <button
        role="link"
        onClick={handleClick}
        className="focus:outline-black text-white text-sm py-2.5 px-4 border-b-4 border-green-600 bg-green-500 hover:bg-green-400 ml-4"
      >
        {t("buyTicket")}
      </button>
    </div>
  );
}
