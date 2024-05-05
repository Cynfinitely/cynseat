// pages/_app.tsx

import "../styles/globals.css";
import type { AppProps } from "next/app";
import "../i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div className="w-screen h-screen">
      <div className="flex justify-between items-center border-b-4 border-purple-600">
        <h1 className="text-purple-900 text-5xl font-semibold leading-none tracking-tighter">
          CynSeat
        </h1>
        <LanguageSwitcher />
      </div>
      <Component {...pageProps} />
    </div>
  );
}

export default MyApp;
