import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "react-i18next";
import { auth } from "../firebase/firebase";
import PageMeta from "../components/PageMeta";
import TicketCard, { TicketCardTicket } from "../components/TicketCard";

type PurchaseState = "processing" | "ready" | "error";

export default function SuccessPage() {
  const router = useRouter();
  const { session_id } = router.query;
  const [countdown, setCountdown] = useState(10);
  const [status, setStatus] = useState<PurchaseState>("processing");
  const [tickets, setTickets] = useState<TicketCardTicket[]>([]);
  const { t } = useTranslation();
  const hasHandledPurchase = useRef(false);
  const isHandlingPurchase = useRef(false);

  useEffect(() => {
    const handlePurchase = async () => {
      if (hasHandledPurchase.current || isHandlingPurchase.current) return;
      isHandlingPurchase.current = true;

      try {
        let userId = auth?.currentUser?.uid;
        let attempts = 0;
        while (!userId && attempts < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          userId = auth?.currentUser?.uid;
          attempts += 1;
        }

        if (!userId) {
          setStatus("error");
          return;
        }

        const sessionRes = await fetch(
          `/api/retrieve-checkout-session?id=${session_id}`
        );
        const sessionData = await sessionRes.json();
        const numTickets = parseInt(sessionData.session.metadata.numTickets, 10);

        const res = await fetch("/api/handlePurchase", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: session_id,
            userId,
            userEmail: auth?.currentUser?.email,
            numTickets,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Purchase failed");
        }
        setTickets(data.tickets || []);
        setStatus("ready");
        hasHandledPurchase.current = true;
      } catch (error) {
        console.error("Purchase response error", error);
        setStatus("error");
      } finally {
        isHandlingPurchase.current = false;
      }
    };

    if (!router.isReady) return;
    if (!session_id) {
      setStatus("error");
      return;
    }
    handlePurchase();
  }, [session_id, router.isReady]);

  useEffect(() => {
    if (status !== "ready") return;
    if (countdown <= 0) {
      router.push("/tickets");
      return;
    }
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, router, status]);

  return (
    <div className="page">
      <PageMeta title={t("paymentSuccess")} />
      <div className="page-narrow">
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            {status === "error" ? t("purchaseFailed") : t("paymentSuccess")}
          </h1>
          <p className="mt-3 text-gray-600">
            {status === "processing"
              ? t("preparingTickets")
              : status === "ready"
                ? t("ticketsReady")
                : t("purchaseFailed")}
          </p>

          {status === "ready" ? (
            <p className="mt-4 text-sm text-gray-500">
              {t("redirect")} {countdown}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3">
            <Link href="/tickets" className="btn-primary">
              {t("viewMyTickets")}
            </Link>
            {status === "error" ? (
              <Link href="/tickets" className="btn-secondary">
                {t("tryAgain")}
              </Link>
            ) : null}
          </div>
        </div>

        {status === "ready" && tickets.length > 0 ? (
          <div className="mt-6 grid gap-4">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.seatCode} ticket={ticket} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
