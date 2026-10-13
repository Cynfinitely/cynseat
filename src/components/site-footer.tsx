import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("common");
  const tAccount = useTranslations("account.find");

  return (
    <footer className="border-line border-t">
      <div className="text-muted mx-auto w-full max-w-6xl px-4 py-6 text-sm sm:px-6">
        <p>
          <Link href="/tickets/find" className="hover:text-ink underline">
            {tAccount("nav")}
          </Link>
        </p>
        <p className="mt-2">
          © {new Date().getFullYear()} CynSeat. {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
