// pages/success.tsx

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { auth } from "../firebase/firebase"; // import Firebase auth
import { useTranslation } from "react-i18next";

export default function SuccessPage() {
  const router = useRouter();
  const { session_id } = router.query;
  const [countdown, setCountdown] = useState(10);
  const { t } = useTranslation();
  const hasHandledPurchase = useRef(false);
  const isHandlingPurchase = useRef(false);

  useEffect(() => {
    const handlePurchase = async () => {
      if (hasHandledPurchase.current || isHandlingPurchase.current) return;
      isHandlingPurchase.current = true;
      let userId = auth.currentUser?.uid; // get user ID from Firebase auth

      // Wait until userId is defined
      while (!userId) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for 1 second
        userId = auth.currentUser?.uid;
      }

      // Get the Checkout Session from Stripe
      const sessionRes = await fetch(
        `/api/retrieve-checkout-session?id=${session_id}`
      );
      const sessionData = await sessionRes.json();

      // Get numTickets from the session metadata
      const numTickets = parseInt(sessionData.session.metadata.numTickets);

      const purchase = {
        id: session_id,
        userId: userId,
        userEmail: auth.currentUser?.email, // use actual user ID
        numTickets: numTickets, // get numTickets from the session metadata
      };
      const res = await fetch("/api/handlePurchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(purchase),
      });
      const data = await res.json();
      console.log("Purchase response", data);
      hasHandledPurchase.current = true;
      isHandlingPurchase.current = false;
    };

    if (session_id) {
      handlePurchase();
    }
  }, [session_id]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      router.push("/tickets");
    }
  }, [countdown, router]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg p-6 text-center mx-4 sm:mx-0">
        <h1 className="text-2xl font-bold mb-4">{t("paymentSuccess")}</h1>
        <p className="mb-4">{t("ticketCreated")}</p>
        <p>
          {t("redirect")} {countdown}...
        </p>
      </div>
    </div>
  );
}
