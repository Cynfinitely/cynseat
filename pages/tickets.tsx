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

  useEffect(() => {
    const fetchTickets = async () => {
      const userId = auth.currentUser?.uid;
      if (userId) {
        // check if userId is defined
        const ticketsQuery = query(
          collection(db, "tickets"),
          where("userId", "==", userId)
        );
        const ticketsSnap = await getDocs(ticketsQuery);
        const tickets = ticketsSnap.docs.map((doc) => doc.data() as Ticket);
        setTickets(tickets);
      }
    };

    fetchTickets();
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
    <div className="bg-red-100 w-full h-full">
      <div className="flex flex-col justify-evenly items-center w-full h-full">
        <h1 className="text-2xl md:text-3xl pl-2 my-2 border-l-4  font-sans font-bold border-teal-400  dark:text-gray-200">
          {t("tickets")}
        </h1>
        <div>
          {tickets.map((ticket) => (
            <div key={ticket.number} className="flex items-center">
              <div className="text-4xl mr-5">{ticket.number}-</div>
              <iframe src={ticket.imageUrl} className="overflow-hidden" />
            </div>
          ))}
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
