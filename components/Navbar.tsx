// app/Header.tsx

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import "firebase/auth";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { logout } from "../API/auth";
import { useRouter } from "next/router";

const Header: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

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
    <header className="p-4 text-white bg-red-100">
      <nav className="flex flex-row sm:flex-col justify-center items-center gap-2 sm:gap-9">
        {user ? (
          <div className="flex flex-row gap-4 justify-center items-stretch">
            <Link href="/about">
              <button className="bg-teal-400 hover:bg-teal-400 text-white font-bold py-2 px-4 border-b-4 border-blue-700 hover:border-blue-500 rounded">
                {t("aboutGame")}
              </button>
            </Link>
            <Link href="/tickets">
              <button className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 border-b-4 border-blue-700 hover:border-blue-500 rounded h-full">
                {t("tickets")}
              </button>
            </Link>

            <button
              onClick={handleSignOut}
              className="bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 border-b-4 border-blue-700 hover:border-blue-500 rounded">
              {t("signOut")}
            </button>
          </div>
        ) : (
          <div className="flex flex-row gap-4 justify-center items-stretch">
            <Link href="/signIn">
              {" "}
              <button className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 border-b-4 border-blue-700 hover:border-blue-500 rounded">
                {t("signIn")}
              </button>
            </Link>
            <Link href="/signUp">
              {" "}
              <button className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 border-b-4 border-blue-700 hover:border-blue-500 rounded">
                {t("signUp")}
              </button>
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;
