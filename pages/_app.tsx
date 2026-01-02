// pages/_app.tsx

import "../styles/globals.css";
import type { AppProps } from "next/app";
import "../i18next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { logout } from "../API/auth";
import { useRouter } from "next/router";

function MyApp({ Component, pageProps }: AppProps) {
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t, i18n } = useTranslation();
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

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
  };

  const currentLanguage = i18n.language;

  return (
    <div className="w-screen h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Unified Header */}
      <header className="w-full bg-white border-b-2 border-purple-200 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            {/* Logo */}
            <Link href="/">
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 cursor-pointer hover:scale-105 transition-transform duration-200 leading-none tracking-tight">
                CynSeat
              </h1>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-3">
              {user ? (
                <>
                  <Link href="/about">
                    <button className="px-4 py-2 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-lg hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                      {t("aboutGame")}
                    </button>
                  </Link>
                  <Link href="/tickets">
                    <button className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                      {t("tickets")}
                    </button>
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                    {t("signOut")}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/signIn">
                    <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                      {t("signIn")}
                    </button>
                  </Link>
                  <Link href="/signUp">
                    <button className="px-4 py-2 bg-white text-purple-600 font-semibold rounded-lg border-2 border-purple-600 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg">
                      {t("signUp")}
                    </button>
                  </Link>
                </>
              )}

              {/* Language Switcher - Desktop */}
              <div className="flex gap-2 ml-2 pl-3 border-l-2 border-gray-200">
                <button
                  className={`px-3 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
                    currentLanguage === "en"
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
                      : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                  }`}
                  onClick={() => changeLanguage("en")}>
                  EN
                </button>
                <button
                  className={`px-3 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
                    currentLanguage === "fi"
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
                      : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                  }`}
                  onClick={() => changeLanguage("fi")}>
                  FI
                </button>
                <button
                  className={`px-3 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
                    currentLanguage === "tr"
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
                      : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                  }`}
                  onClick={() => changeLanguage("tr")}>
                  TR
                </button>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-200">
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
          </div>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="lg:hidden pb-4 space-y-2 animate-fadeIn">
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

              {/* Language Switcher - Mobile */}
              <div className="flex gap-2 pt-2 border-t-2 border-gray-200">
                <button
                  className={`flex-1 px-3 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
                    currentLanguage === "en"
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
                      : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                  }`}
                  onClick={() => changeLanguage("en")}>
                  EN
                </button>
                <button
                  className={`flex-1 px-3 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
                    currentLanguage === "fi"
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
                      : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                  }`}
                  onClick={() => changeLanguage("fi")}>
                  FI
                </button>
                <button
                  className={`flex-1 px-3 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
                    currentLanguage === "tr"
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
                      : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                  }`}
                  onClick={() => changeLanguage("tr")}>
                  TR
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full flex-grow overflow-auto">
        <Component {...pageProps} />
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-gray-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-gray-600 text-sm">
            © {new Date().getFullYear()} CynSeat. {t("allRightsReserved")}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default MyApp;