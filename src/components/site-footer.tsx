import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("common");
  const tAccount = useTranslations("account.find");

  return (
    <footer className="border-line border-t">
      <div className="text-muted mx-auto w-full max-w-6xl px-4 py-6 text-sm sm:px-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          <li>
            <Link href="/tickets/find" className="hover:text-ink underline">
              {tAccount("nav")}
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="hover:text-ink underline">
              {t("footer.privacy")}
            </Link>
          </li>
          <li>
            <Link href="/terms" className="hover:text-ink underline">
              {t("footer.terms")}
            </Link>
          </li>
        </ul>
        <p className="mt-2">
          © {new Date().getFullYear()} CynSeat. {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
