// pages/success.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth } from "../firebase/firebase"; // import Firebase auth
import { useTranslation } from "react-i18next";

export default function SuccessPage() {
  const router = useRouter();
  const { session_id } = router.query;
  const [countdown, setCountdown] = useState(10);
  const { t } = useTranslation();

  useEffect(() => {
    const handlePurchase = async () => {
      let userId = auth.currentUser?.uid; // get user ID from Firebase auth

      // Wait until userId is defined
      while (!userId) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for 1 second
        userId = auth.currentUser?.uid;
      }

      const purchase = {
        id: session_id,
        userId: userId, // use actual user ID
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
    <div>
      <h1>{t("paymentSuccess")}</h1>
      <p>{t("ticketCreated")}</p>
      <p>
        {t("redirect")} {countdown}
      </p>
    </div>
  );
}
