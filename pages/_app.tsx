import "../styles/globals.css";
import type { AppProps } from "next/app";
import "../i18next";
import Head from "next/head";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "../contexts/AuthContext";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "../lib/constants";

function LanguageRestore() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (
      stored &&
      SUPPORTED_LANGUAGES.includes(stored as (typeof SUPPORTED_LANGUAGES)[number]) &&
      stored !== i18n.language.split("-")[0]
    ) {
      i18n.changeLanguage(stored);
    }
  }, [i18n]);

  return null;
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <LanguageRestore />
      <Head>
        <title>CynSeat</title>
        <meta
          name="description"
          content="CynSeat — tickets for Tell It Like a Fairy Tale"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="flex min-h-dvh flex-col bg-gray-50">
        <Header />
        <main className="w-full flex-grow">
          <Component {...pageProps} />
        </main>
        <Footer />
      </div>
    </AuthProvider>
  );
}

export default MyApp;
