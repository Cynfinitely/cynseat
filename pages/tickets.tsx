// pages/tickets.tsx

import React from "react";
import { useRouter } from "next/router";
import { logout } from "../API/auth";
import { useTranslation } from "react-i18next";

const Tickets: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    try {
      await logout();
      router.push("/signIn");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="bg-red-100 w-screen h-screen">
      <div className="flex flex-col justify-center items-center w-full h-full">
        <h1>{t("tickets")}</h1>
        <button
          onClick={handleSignOut}
          className="p-2 bg-red-500 text-white rounded"
        >
          {t("signOut")}
        </button>
      </div>
    </div>
  );
};

export default Tickets;
