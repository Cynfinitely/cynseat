import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslations from "./locales/en/common.json";
import fiTranslations from "./locales/fi/common.json";
import trTranslations from "./locales/tr/common.json";

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
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
