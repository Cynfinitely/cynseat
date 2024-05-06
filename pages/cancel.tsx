// pages/cancel.tsx

import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function CancelPage() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t("purchaseCancelled")}</h1>
      <Link href="/tickets">{t("backTickets")}</Link>
    </div>
  );
}
