import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AccountMenu } from "./account-menu";
import { LanguageSwitcher } from "./language-switcher";

export function SiteHeader() {
  const t = useTranslations("common");

  return (
    <header className="border-line bg-surface sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          aria-label={t("nav.home")}
          className="text-brand-700 text-lg font-bold tracking-tight"
        >
          CynSeat
        </Link>
        <div className="flex items-center gap-3">
          <AccountMenu />
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
