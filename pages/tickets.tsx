import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "react-i18next";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import CheckoutButton from "@/components/CheckoutButton";
import PageMeta from "../components/PageMeta";
import TicketCard, { TicketCardTicket } from "../components/TicketCard";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/firebase";
import {
  LOW_REMAINING_THRESHOLD,
  MAX_EVENT_TICKETS,
} from "../lib/constants";

const Tickets: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [tickets, setTickets] = useState<TicketCardTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [remainingSeats, setRemainingSeats] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/signIn?returnUrl=/tickets");
      return;
    }

    const fetchTickets = async () => {
      if (!db) {
        setLoading(false);
        return;
      }
      try {
        const ticketsRef = collection(db, "tickets");
        const snap = await getDocs(query(ticketsRef, orderBy("seatCode", "asc")));
        const ticketDocs = snap.docs
          .filter((ticketDoc) => ticketDoc.id !== "seatIndex")
          .map((ticketDoc) => ticketDoc.data() as TicketCardTicket & { userId?: string })
          .filter((ticket) => ticket.userId === user.uid);

        setTickets(ticketDocs);

        const seatIndexDoc = await getDoc(doc(db, "tickets", "seatIndex"));
        const currentIndex = seatIndexDoc.exists()
          ? seatIndexDoc.data()?.index ?? 0
          : 0;
        setRemainingSeats(Math.max(0, MAX_EVENT_TICKETS - currentIndex));
      } catch (error) {
        console.error("Error fetching tickets:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="page">
        <PageMeta title={t("myTickets")} />
        <p className="page-wide text-gray-600">{t("loadingTickets")}</p>
      </div>
    );
  }

  const showRemaining =
    remainingSeats !== null && remainingSeats <= LOW_REMAINING_THRESHOLD;

  return (
    <div className="page">
      <PageMeta title={t("myTickets")} />
      <div className="page-wide space-y-8">
        <div>
          <h1 className="page-title">{t("myTickets")}</h1>
          <p className="mt-2 text-gray-600">{t("about.title")}</p>
        </div>

        <section className="card p-6">
          <h2 className="section-title mb-2">{t("purchaseTickets")}</h2>
          <p className="mb-2 text-sm text-gray-600">{t("ticketWarning")}</p>
          <p className="mb-4 text-sm text-gray-600">{t("ticketWarning2")}</p>
          <p className="mb-4 text-sm text-gray-600">{t("under12")}</p>
          {showRemaining ? (
            <p className="mb-4 text-sm font-medium text-purple-700">
              {t("remainingSeats", { count: remainingSeats })}
            </p>
          ) : null}
          <CheckoutButton remainingSeats={remainingSeats} />
        </section>

        <section>
          <h2 className="section-title mb-4">{t("eventTicket")}</h2>
          {loading ? (
            <p className="text-gray-600">{t("loadingTickets")}</p>
          ) : tickets.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tickets.map((ticket) => (
                <TicketCard key={ticket.seatCode} ticket={ticket} />
              ))}
            </div>
          ) : (
            <div className="card px-6 py-12 text-center">
              <p className="text-lg font-semibold text-gray-900">{t("noTicketsYet")}</p>
              <p className="mt-2 text-gray-600">{t("noTicketsYetDesc")}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Tickets;
