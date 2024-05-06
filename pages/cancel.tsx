// pages/cancel.tsx

import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function CancelPage() {
  const { t } = useTranslation();

  return (
    <div className="bg-red-100 w-full h-full">
      <div className="flex flex-col justify-evenly items-center w-full h-full">
        <h1>{t("purchaseCancelled")}</h1>
        <Link href="/tickets">{t("backTickets")}</Link>
      </div>
    </div>
  );
}
