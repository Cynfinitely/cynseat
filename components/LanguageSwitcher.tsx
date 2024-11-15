import React from "react";
import { useTranslation } from "react-i18next";

function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
  };

  return (
    <div className="flex flex-row  justify-end gap-5 px-5 py-3">
      <button
        className="px-4 py-2 border-b-4 border border-red-500 text-red-500 hover:text-white hover:bg-red-500 transition-all duration-200"
        onClick={() => changeLanguage("en")}>
        English
      </button>
      <button
        className="px-4 py-2 border-b-4 border border-red-500 text-red-500 hover:text-white hover:bg-red-500 transition-all duration-200"
        onClick={() => changeLanguage("fi")}>
        Suomi
      </button>
      <button
        className="px-4 py-2 border-b-4 border border-red-500 text-red-500 hover:text-white hover:bg-red-500 transition-all duration-200"
        onClick={() => changeLanguage("tr")}>
        Türkçe
      </button>
    </div>
  );
}

export default LanguageSwitcher;
