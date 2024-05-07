// pages/tickets.tsx

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { logout } from "../API/auth";
import { useTranslation } from "react-i18next";
import CheckoutButton from "@/components/CheckoutButton";
import { auth, db } from "../firebase/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

type Ticket = {
  number: number;
  purchaseId: string;
  userId: string;
  imageUrl: string;
};

const Tickets: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        const fetchTickets = async () => {
          const userId = user.uid;
          const ticketsQuery = query(
            collection(db, "tickets"),
            where("userId", "==", userId)
          );
          const ticketsSnap = await getDocs(ticketsQuery);
          const tickets = ticketsSnap.docs.map((doc) => doc.data() as Ticket);
          setTickets(tickets);
          setLoading(false);
        };

        fetchTickets();
      } else {
        setLoading(false);
      }
    });

    // Cleanup function
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await logout();
      router.push("/signIn");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="bg-red-100 w-full min-h-screen">
      <div className="flex flex-col justify-start items-center w-full px-4 md:px-0">
        <h1 className="text-2xl md:text-3xl pl-2 my-2 border-l-4  font-sans font-bold border-teal-400  dark:text-gray-200">
          {t("tickets")}
        </h1>
        <div className="w-full overflow-auto">
          {loading ? (
            <div className="w-16 h-16 border-t-4 border-b-4 border-blue-500 rounded-full animate-spin"></div>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.number}
                className="flex items-center justify-center"
              >
                <div className="w-full px-4">
                  <div className="bg-white shadow-lg rounded-lg my-6 grid grid-cols-1 md:grid-cols-[auto,1fr]">
                    <div className="bg-gray-100 px-5 py-2 flex items-center justify-center __col h-full">
                      <a
                        href={ticket.imageUrl}
                        download
                        className="text-blue-600 font-medium hover:text-blue-800"
                      >
                        {t("download")}
                      </a>
                    </div>
                    <div className="p-6">
                      <iframe
                        src={ticket.imageUrl}
                        className="w-full h-64 md:h-auto"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <CheckoutButton />
          <button
            onClick={handleSignOut}
            className="p-2 bg-red-500 text-white rounded"
          >
            {t("signOut")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Tickets;
