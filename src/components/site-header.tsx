import { Armchair } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { AccountMenu } from "./account-menu";
import { LanguageSwitcher } from "./language-switcher";

export function SiteHeader() {
  const t = useTranslations("common");

  return (
    <header className="border-line bg-paper sticky top-0 z-40 border-b">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          aria-label={t("nav.home")}
          className="text-ink font-display inline-flex items-center gap-2 text-3xl tracking-tight"
        >
          <Armchair aria-hidden className="text-brand-600 size-7" strokeWidth={1.5} />
          CynSeat
        </Link>
        <div className="flex max-w-full flex-wrap items-center gap-2 sm:gap-4">
          <AccountMenu />
          <Suspense>
            <LanguageSwitcher />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
