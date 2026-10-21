"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const active = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("nav.language")}>
      <ul className="border-line flex rounded-md border p-0.5 text-xs font-semibold">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Link
              href={pathname}
              locale={locale}
              lang={locale}
              aria-current={locale === active ? "true" : undefined}
              aria-label={t(`languages.${locale}`)}
              className={cn(
                "block rounded px-2 py-1 uppercase",
                locale === active ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
              )}
            >
              {locale}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
