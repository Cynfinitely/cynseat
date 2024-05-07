// pages/_app.tsx

import "../styles/globals.css";
import type { AppProps } from "next/app";
import "../i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Navbar from "@/components/Navbar";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div className="w-screen h-screen flex flex-col">
      <header className="w-full flex flex-col sm:flex-row justify-between items-center border-b-4 border-purple-600 p-4">
        <h1 className="text-purple-900 text-2xl sm:text-5xl font-semibold leading-none tracking-tighter mb-2 sm:mb-0">
          CynSeat
        </h1>
        <LanguageSwitcher />
      </header>
      <Navbar />
      <main className="w-full flex-grow overflow-auto">
        <Component {...pageProps} />
      </main>
    </div>
  );
}

export default MyApp;