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
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900/50 via-blue-900/50 to-purple-900/50 backdrop-blur-sm z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center mx-4 max-w-md w-full transform animate-[fadeIn_0.3s_ease-in-out]">
        {/* Success Icon */}
        <div className="mb-6 relative">
          <div className="w-20 h-20 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <span className="text-5xl">✓</span>
          </div>
          <div className="absolute inset-0 w-20 h-20 bg-green-400 rounded-full mx-auto animate-ping opacity-20"></div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-800 mb-3">
          {t("paymentSuccess")}
        </h1>

        {/* Message */}
        <p className="text-lg text-gray-600 mb-6">
          {t("ticketCreated")}
        </p>

        {/* Countdown */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 mb-4">
          <p className="text-gray-700 font-medium">
            {t("redirect")}
          </p>
          <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 mt-2">
            {countdown}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-600 to-blue-600 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${((10 - countdown) / 10) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
