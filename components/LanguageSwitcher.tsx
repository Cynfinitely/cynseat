import { useTranslation } from "react-i18next";
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "../lib/constants";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLanguage = (i18n.language || "en").split("-")[0];

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  };

  return (
    <div
      className="inline-flex rounded-md border border-gray-200 p-0.5"
      role="group"
      aria-label={t("language")}
    >
      {SUPPORTED_LANGUAGES.map((code) => {
        const active = currentLanguage === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => changeLanguage(code)}
            aria-pressed={active}
            className={`min-w-[2.25rem] rounded px-2 py-1 text-xs font-semibold uppercase ${
              active
                ? "bg-purple-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
