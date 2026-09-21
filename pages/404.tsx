import Link from "next/link";
import { useTranslation } from "react-i18next";
import PageMeta from "../components/PageMeta";

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="page">
      <PageMeta title={t("pageNotFound")} />
      <div className="page-narrow card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">{t("pageNotFound")}</h1>
        <p className="mt-3 text-gray-600">{t("pageNotFoundDesc")}</p>
        <Link href="/" className="btn-primary mt-6">
          {t("goHome")}
        </Link>
      </div>
    </div>
  );
}

export async function getStaticProps() {
  return { props: {} };
}
