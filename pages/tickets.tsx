// pages/tickets.tsx
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CheckoutButton from "@/components/CheckoutButton";
import { auth, db } from "../firebase/firebase";
import {
  collection,
  query,
  getDocs,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";

interface Ticket {
  seatCode: string;
  purchaseId: string;
  userId: string;
  userEmail: string;
  imageUrl: string;
}

const Tickets: React.FC = () => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalTicketsSold, setTotalTicketsSold] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const ticketsRef = collection(db, "tickets");
        const q = query(ticketsRef, orderBy("seatCode", "asc"));
        const snap = await getDocs(q);
        setTickets(snap.docs.map((d) => d.data() as Ticket));

        const seatIndexDoc = await getDoc(doc(db, "tickets", "seatIndex"));
        const currentIndex = seatIndexDoc.exists()
          ? seatIndexDoc.data()?.index ?? 0
          : 0;
        setTotalTicketsSold(currentIndex);
      } catch (error) {
        console.error("Error fetching tickets:", error);
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) fetchTickets();
      else setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.seatCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-red-100 w-full min-h-screen">
      <div className="flex flex-col justify-start items-center w-full px-4 md:px-0">
        <div className="flex flex-col md:flex-row items-center w-full relative">
          <h1 className="text-2xl md:text-3xl pl-2 my-2 border-l-4 font-sans font-bold border-teal-400 mx-auto">
            {t("tickets")}
          </h1>
          <p className="md:absolute md:right-10 my-4 md:mt-4 text-lg font-semibold">
            {t("totalTicketsSold")}: {totalTicketsSold}
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          <CheckoutButton />
        </div>

        <div className="mt-4 font-bold">{t("under12")}</div>

        {/* Search Input */}
        <input
          type="text"
          className="border p-2 mt-6 mb-4 rounded w-60"
          placeholder="Search emails or tickets"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="w-full overflow-auto">
          {loading ? (
            <div className="w-16 h-16 border-t-4 border-b-4 border-blue-500 rounded-full animate-spin" />
          ) : filteredTickets.length > 0 ? (
            <table className="min-w-full bg-white shadow-lg rounded-lg overflow-hidden">
              <thead>
                <tr>
                  <th className="py-2 px-4 bg-gray-200 font-semibold text-left">
                    {t("ticketNumber")}
                  </th>
                  <th className="py-2 px-4 bg-gray-200 font-semibold text-left">
                    {t("userEmail")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket, idx) => (
                  <tr
                    key={idx}
                    className="border-b">
                    <td className="py-2 px-4">{ticket.seatCode}</td>
                    <td className="py-2 px-4">{ticket.userEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-center text-gray-700">{t("noTicketsFound")}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Tickets;
