import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("common");

  return (
    <footer className="border-line border-t">
      <div className="text-muted mx-auto w-full max-w-6xl px-4 py-6 text-sm sm:px-6">
        © {new Date().getFullYear()} CynSeat. {t("footer.rights")}
      </div>
    </footer>
  );
}
