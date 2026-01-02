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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      setMobileMenuOpen(false);
      router.push("/signIn");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <header className="bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-200 shadow-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Desktop Navigation */}
        <div className="hidden md:flex justify-center items-center gap-4 py-4">
          {user ? (
            <>
              <Link href="/about">
                <button className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-lg hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                  {t("aboutGame")}
                </button>
              </Link>
              <Link href="/tickets">
                <button className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                  {t("tickets")}
                </button>
              </Link>
              <button
                onClick={handleSignOut}
                className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                {t("signOut")}
              </button>
            </>
          ) : (
            <>
              <Link href="/signIn">
                <button className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                  {t("signIn")}
                </button>
              </Link>
              <Link href="/signUp">
                <button className="px-6 py-2.5 bg-white text-purple-600 font-semibold rounded-lg border-2 border-purple-600 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                  {t("signUp")}
                </button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden py-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-full px-4 py-2 bg-white text-purple-600 font-semibold rounded-lg border-2 border-purple-600 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors duration-200">
            {mobileMenuOpen ? "✕ Close Menu" : "☰ Menu"}
          </button>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="mt-4 space-y-2 animate-fadeIn">
              {user ? (
                <>
                  <Link href="/about" onClick={() => setMobileMenuOpen(false)}>
                    <button className="w-full px-4 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-lg hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200 shadow-md">
                      {t("aboutGame")}
                    </button>
                  </Link>
                  <Link href="/tickets" onClick={() => setMobileMenuOpen(false)}>
                    <button className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 shadow-md">
                      {t("tickets")}
                    </button>
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all duration-200 shadow-md">
                    {t("signOut")}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/signIn" onClick={() => setMobileMenuOpen(false)}>
                    <button className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-200 shadow-md">
                      {t("signIn")}
                    </button>
                  </Link>
                  <Link href="/signUp" onClick={() => setMobileMenuOpen(false)}>
                    <button className="w-full px-4 py-3 bg-white text-purple-600 font-semibold rounded-lg border-2 border-purple-600 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-200 shadow-md">
                      {t("signUp")}
                    </button>
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Header;
