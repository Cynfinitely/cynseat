import Link from "next/link";
import { useTranslation } from "react-i18next";
import PageMeta from "../components/PageMeta";

export default function CancelPage() {
  const { t } = useTranslation();

  return (
    <div className="page">
      <PageMeta title={t("purchaseCancelled")} />
      <div className="page-narrow">
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            {t("purchaseCancelled")}
          </h1>
          <p className="mt-3 text-gray-600">{t("cancelMessage")}</p>
          <p className="mt-4 text-sm text-gray-600">{t("cancelDescription")}</p>
          <div className="mt-6 flex flex-col gap-3">
            <Link href="/tickets" className="btn-primary">
              {t("tryAgain")}
            </Link>
            <Link href="/" className="btn-secondary">
              {t("goHome")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
