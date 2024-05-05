// components/CheckoutButton.tsx

import { loadStripe } from "@stripe/stripe-js";
import { auth } from "../firebase/firebase"; // import Firebase auth
import { useTranslation } from "react-i18next";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export default function CheckoutButton() {
  const { t } = useTranslation();

  const handleClick = async () => {
    const stripe = await stripePromise;
    const res = await fetch("/api/create-checkout-session", { method: "POST" });
    const session = await res.json();
    if (stripe) {
      const result = await stripe.redirectToCheckout({
        sessionId: session.sessionId,
      });
      if (result.error) {
        alert(result.error.message);
      } else {
        // Call handlePurchase API after successful checkout
        const userId = auth.currentUser?.uid; // get user ID from Firebase auth
        const purchase = {
          id: session.sessionId,
          userId: userId, // use actual user ID
        };
        const purchaseRes = await fetch("/api/handlePurchase", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(purchase),
        });
        const purchaseData = await purchaseRes.json();
      }
    }
  };

  return (
    <button
      role="link"
      onClick={handleClick}
      className="focus:outline-black text-white text-sm py-2.5 px-4 border-b-4 border-green-600 bg-green-500 hover:bg-green-400"
    >
      {t("buyTicket")}
    </button>
  );
}
