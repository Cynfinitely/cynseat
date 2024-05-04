// pages/_app.tsx

import "../styles/globals.css";
import type { AppProps } from "next/app";
import "../i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div>
      <LanguageSwitcher />
      <Component {...pageProps} />;
    </div>
  );
}

export default MyApp;
