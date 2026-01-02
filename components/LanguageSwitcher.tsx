import React from "react";
import { useTranslation } from "react-i18next";

function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
  };

  const currentLanguage = i18n.language;

  return (
    <div className="flex flex-row justify-end gap-2 sm:gap-3 px-3 py-2">
      <button
        className={`px-3 sm:px-4 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
          currentLanguage === "en"
            ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
            : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
        }`}
        onClick={() => changeLanguage("en")}>
        EN
      </button>
      <button
        className={`px-3 sm:px-4 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
          currentLanguage === "fi"
            ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
            : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
        }`}
        onClick={() => changeLanguage("fi")}>
        FI
      </button>
      <button
        className={`px-3 sm:px-4 py-2 font-semibold rounded-lg border-2 transition-all duration-200 ${
          currentLanguage === "tr"
            ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-transparent shadow-lg"
            : "bg-white text-purple-600 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
        }`}
        onClick={() => changeLanguage("tr")}>
        TR
      </button>
    </div>
  );
}

export default LanguageSwitcher;
