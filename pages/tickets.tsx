// pages/tickets.tsx

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CheckoutButton from "@/components/CheckoutButton";
import { auth, db } from "../firebase/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

type Ticket = {
  number: number;
  purchaseId: string;
  userId: string;
  imageUrl: string;
};

const Tickets: React.FC = () => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalTicketsSold, setTotalTicketsSold] = useState<number>(0);

  // Define the starting ticket number
  const startingTicketNumber = 77;

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

          // Fetch total tickets sold
          const ticketNumberDoc = await getDoc(
            doc(db, "tickets", "nextNumber")
          );
          const currentTicketNumber = ticketNumberDoc.exists()
            ? ticketNumberDoc.data()?.number ?? startingTicketNumber
            : startingTicketNumber - 1;

          // Adjust the total tickets sold calculation
          const totalTickets = currentTicketNumber - startingTicketNumber;
          setTotalTicketsSold(totalTickets);
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

  return (
    <div className="bg-red-100 w-full min-h-screen">
      <div className="flex flex-col justify-start items-center w-full px-4 md:px-0">
        {/* Adjusted Flex Container */}
        <div className="flex flex-col md:flex-row items-center w-full relative">
          <h1 className="text-2xl md:text-3xl pl-2 my-2 border-l-4 font-sans font-bold border-teal-400 mx-auto">
            {t("tickets")}
          </h1>
          {/* Display total tickets sold */}
          <p className="md:absolute md:right-10 my-4 md:mt-4 text-lg font-semibold">
            {t("totalTicketsSold")}: {totalTicketsSold}
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          <CheckoutButton />
        </div>
        <p className="mt-5">{t("ticketWarning")}</p>
        <p className="mt-5">{t("ticketWarning2")}</p>
        <p className="mt-2">
          {t("age")}: <b>7+</b>
        </p>
        <p>
          {t("time")}: <b>2 {t("hours")} </b>
        </p>
        <p>
          {t("language")}: <b>Türkçe</b>
        </p>

        <div className="w-full overflow-auto">
          {loading ? (
            <div className="w-16 h-16 border-t-4 border-b-4 border-blue-500 rounded-full animate-spin"></div>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.number}
                className="flex items-center justify-center">
                <div className="w-full px-4">
                  <div className="bg-white shadow-lg rounded-lg my-6 grid grid-cols-1 md:grid-cols-[auto,1fr]">
                    <div className="bg-gray-100 px-5 py-2 flex items-center justify-center __col h-full">
                      <a
                        href={ticket.imageUrl}
                        download
                        className="text-blue-600 font-medium hover:text-blue-800">
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
      </div>
    </div>
  );
};

export default Tickets;
