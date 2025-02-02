// pages/tickets.tsx

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CheckoutButton from "@/components/CheckoutButton";
import { auth, db } from "../firebase/firebase";
import {
  collection,
  query,
  getDocs,
  orderBy, // Import orderBy
  doc,
  getDoc,
} from "firebase/firestore";

type Ticket = {
  number: number;
  purchaseId: string;
  userId: string;
  userEmail: string;
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
    const fetchTickets = async () => {
      try {
        // Create a query with orderBy to sort tickets by number in ascending order
        const ticketsRef = collection(db, "tickets");
        const ticketsQuery = query(ticketsRef, orderBy("number", "asc"));
        const ticketsSnap = await getDocs(ticketsQuery);
        const fetchedTickets = ticketsSnap.docs.map(
          (doc) => doc.data() as Ticket
        );
        setTickets(fetchedTickets);

        // Fetch total tickets sold
        const ticketNumberDoc = await getDoc(doc(db, "tickets", "nextNumber"));
        const currentTicketNumber = ticketNumberDoc.exists()
          ? ticketNumberDoc.data()?.number ?? startingTicketNumber
          : startingTicketNumber - 1;

        // Adjust the total tickets sold calculation
        const totalTickets = currentTicketNumber - startingTicketNumber;
        setTotalTicketsSold(totalTickets);
      } catch (error) {
        console.error("Error fetching tickets:", error);
        // Optionally, set an error state here to inform the user
      } finally {
        setLoading(false);
      }
    };

    // Optional: Check if the user is authenticated or has the right permissions
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
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

        <div className="w-full overflow-auto mt-8">
          {loading ? (
            <div className="w-16 h-16 border-t-4 border-b-4 border-blue-500 rounded-full animate-spin"></div>
          ) : tickets.length > 0 ? (
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
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.number}
                    className="border-b">
                    <td className="py-2 px-4">{ticket.number}</td>
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
