import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "react-i18next";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import PageMeta from "../components/PageMeta";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/firebase";
import { MAX_EVENT_TICKETS } from "../lib/constants";

interface AdminTicket {
  seatCode: string;
  userEmail: string;
  imageUrl?: string;
}

const AdminPage: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalSold, setTotalSold] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/signIn?returnUrl=/admin");
      return;
    }
    if (!isAdmin) {
      router.replace("/tickets");
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
          .map((ticketDoc) => ticketDoc.data() as AdminTicket);
        setTickets(ticketDocs);

        const seatIndexDoc = await getDoc(doc(db, "tickets", "seatIndex"));
        const currentIndex = seatIndexDoc.exists()
          ? seatIndexDoc.data()?.index ?? ticketDocs.length
          : ticketDocs.length;
        setTotalSold(currentIndex);
      } catch (error) {
        console.error("Error fetching tickets:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [authLoading, user, isAdmin, router]);

  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.seatCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const downloadTicketsList = () => {
    let content = "CynSeat tickets\n\n";
    content += `Total tickets sold: ${tickets.length}\n`;
    content += `Generated: ${new Date().toLocaleString()}\n\n`;

    tickets.forEach((ticket, index) => {
      const seatNumber = ticket.seatCode.replace("SEAT-", "");
      content += `${index + 1}. Seat ${seatNumber} — ${ticket.userEmail}\n`;
    });

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cynseat-tickets-list-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (authLoading || !user || !isAdmin) {
    return (
      <div className="page">
        <PageMeta title={t("adminTitle")} />
        <p className="page-wide text-gray-600">{t("loadingTickets")}</p>
      </div>
    );
  }

  const remaining = Math.max(0, MAX_EVENT_TICKETS - totalSold);

  return (
    <div className="page">
      <PageMeta title={t("adminTitle")} />
      <div className="page-wide space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title">{t("adminTitle")}</h1>
            <p className="mt-2 text-gray-600">{t("about.title")}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="card px-4 py-3">
              <p className="text-gray-500">{t("ticketsSold")}</p>
              <p className="text-xl font-semibold">{totalSold}</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-gray-500">{t("ticketsRemaining")}</p>
              <p className="text-xl font-semibold">{remaining}</p>
            </div>
          </div>
        </div>

        <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">{t("adminDownloadList")}</h2>
            <p className="text-sm text-gray-600">{t("adminDownloadListDesc")}</p>
          </div>
          <button
            type="button"
            onClick={downloadTicketsList}
            disabled={tickets.length === 0}
            className="btn-secondary"
          >
            {t("downloadList")}
          </button>
        </div>

        <div className="card p-5">
          <label htmlFor="search" className="mb-2 block text-sm font-medium text-gray-700">
            {t("searchTickets")}
          </label>
          <input
            id="search"
            type="search"
            className="input-field max-w-md"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <p className="px-6 py-12 text-gray-600">{t("loadingTickets")}</p>
          ) : filteredTickets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("ticketNumber")}</th>
                    <th className="px-4 py-3 font-medium">{t("userEmail")}</th>
                    <th className="px-4 py-3 font-medium">{t("download")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr key={ticket.seatCode} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium">
                        {ticket.seatCode.replace("SEAT-", "")}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{ticket.userEmail}</td>
                      <td className="px-4 py-3">
                        {ticket.imageUrl ? (
                          <a
                            href={ticket.imageUrl}
                            download={`ticket-${ticket.seatCode}.pdf`}
                            className="font-medium text-purple-700 hover:text-purple-800"
                          >
                            {t("downloadPDF")}
                          </a>
                        ) : (
                          <span className="text-gray-400">{t("notAvailable")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-6 py-12 text-gray-600">{t("noTicketsFound")}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
