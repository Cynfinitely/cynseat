import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslations from "./locales/en/common.json";
import fiTranslations from "./locales/fi/common.json";
import trTranslations from "./locales/tr/common.json";
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "./lib/constants";

function getInitialLanguage(): string {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored as (typeof SUPPORTED_LANGUAGES)[number])) {
    return stored;
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: enTranslations,
    },
    fi: {
      translation: fiTranslations,
    },
    tr: {
      translation: trTranslations,
    },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
