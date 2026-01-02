// pages/cancel.tsx

import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function CancelPage() {
  const { t } = useTranslation();

  return (
    <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 w-full min-h-full">
      <div className="flex flex-col justify-center items-center w-full min-h-full px-4 py-12">
        <div className="max-w-md w-full">
          {/* Card Container */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center space-y-6">
            {/* Cancel Icon */}
            <div className="mb-6 relative">
              <div className="w-20 h-20 bg-gradient-to-r from-red-400 to-orange-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
                <span className="text-5xl">✕</span>
              </div>
              <div className="absolute inset-0 w-20 h-20 bg-red-400 rounded-full mx-auto animate-pulse opacity-20"></div>
            </div>

            {/* Title */}
            <h1 className="text-3xl font-bold text-gray-800 mb-3">
              {t("purchaseCancelled")}
            </h1>

            {/* Message */}
            <p className="text-lg text-gray-600 mb-6">
              {t("cancelMessage")}
            </p>

            {/* Info Box */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-left">
              <p className="text-sm text-gray-700">
                <strong>💡 {t("whatHappened")}</strong><br />
                {t("cancelDescription")}
              </p>
            </div>

            {/* Back Button */}
            <Link href="/tickets">
              <button className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl">
                {t("backTickets")}
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
