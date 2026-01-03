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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setLoading(false);
          return;
        }

        const adminStatus = currentUser.email === "celalyasinnari@gmail.com";
        setIsAdmin(adminStatus);
        
        // Fetch all tickets from the main collection
        const ticketsRef = collection(db, "tickets");
        const q = query(ticketsRef, orderBy("seatCode", "asc"));
        const snap = await getDocs(q);
        
        // Filter out the seatIndex document and map to Ticket objects
        let ticketDocs = snap.docs
          .filter((doc) => doc.id !== "seatIndex")
          .map((d) => d.data() as Ticket);
        
        // If not admin, filter to show only current user's tickets
        if (!adminStatus) {
          ticketDocs = ticketDocs.filter((ticket) => ticket.userId === currentUser.uid);
        }
        
        setTickets(ticketDocs);

        // Only show total tickets sold for admin
        if (adminStatus) {
          const seatIndexDoc = await getDoc(doc(db, "tickets", "seatIndex"));
          const currentIndex = seatIndexDoc.exists()
            ? seatIndexDoc.data()?.index ?? 0
            : 0;
          setTotalTicketsSold(currentIndex);
        } else {
          setTotalTicketsSold(ticketDocs.length);
        }
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
    <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 w-full min-h-screen">
      <div className="flex flex-col justify-start items-center w-full px-4 md:px-8 py-8">
        {/* Header Section */}
        <div className="w-full max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between mb-8 bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center mb-4 md:mb-0">
              <div className="w-1 h-12 bg-gradient-to-b from-purple-600 to-blue-600 rounded-full mr-4"></div>
              <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
                {t("tickets")}
              </h1>
            </div>
            <div className="flex items-center gap-2 bg-gradient-to-r from-purple-100 to-blue-100 px-6 py-3 rounded-full">
              <span className="text-2xl">🎫</span>
              <div className="text-left">
                <p className="text-sm text-gray-600 font-medium">{t("totalTicketsSold")}</p>
                <p className="text-2xl font-bold text-purple-600">{totalTicketsSold}</p>
              </div>
            </div>
          </div>

          {/* Purchase Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">{t("purchaseTickets")}</h2>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <CheckoutButton />
            </div>
          </div>

          {/* Search Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
            <div className="max-w-md mx-auto">
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                {t("searchTickets")}
              </label>
              <div className="relative">
                <input
                  id="search"
                  type="text"
                  className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 outline-none"
                  placeholder={t("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">
                  🔍
                </span>
              </div>
            </div>
          </div>

          {/* Tickets Table Section */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-600 font-medium">{t("loadingTickets")}</p>
              </div>
            ) : filteredTickets.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-purple-600 to-blue-600">
                    <tr>
                      <th className="py-4 px-6 text-left text-sm font-semibold text-white uppercase tracking-wider">
                        {t("ticketNumber")}
                      </th>
                      {isAdmin && (
                        <th className="py-4 px-6 text-left text-sm font-semibold text-white uppercase tracking-wider">
                          {t("userEmail")}
                        </th>
                      )}
                      <th className="py-4 px-6 text-center text-sm font-semibold text-white uppercase tracking-wider">
                        {t("download")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredTickets.map((ticket, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-purple-50 transition-colors duration-150">
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center">
                            <span className="text-2xl mr-3">🎫</span>
                            <span className="text-sm font-semibold text-gray-900">
                              {ticket.seatCode.replace('SEAT-', '')}
                            </span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="py-4 px-6 whitespace-nowrap">
                            <span className="text-sm text-gray-700">{ticket.userEmail}</span>
                          </td>
                        )}
                        <td className="py-4 px-6 text-center">
                          {ticket.imageUrl ? (
                            <a
                              href={ticket.imageUrl}
                              download={`ticket-${ticket.seatCode}.pdf`}
                              className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg">
                              <span>⬇️</span>
                              {t("downloadPDF")}
                            </a>
                          ) : (
                            <span className="text-gray-400 text-sm">{t("notAvailable")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <span className="text-6xl mb-4">🎫</span>
                <p className="text-xl text-gray-700 font-semibold mb-2">{t("noTicketsFound")}</p>
                <p className="text-gray-500">{t("noTicketsFoundDesc")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tickets;
