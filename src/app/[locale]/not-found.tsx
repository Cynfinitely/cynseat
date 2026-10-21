import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("common.notFound");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-20 text-center">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-3">{t("description")}</p>
      <Link href="/" className={buttonVariants({ className: "mt-8" })}>
        {t("home")}
      </Link>
    </div>
  );
}
