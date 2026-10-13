import { CalendarDays, QrCode, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/i18n/routing";

const features = [
  { key: "organizations", Icon: Users },
  { key: "seating", Icon: CalendarDays },
  { key: "tickets", Icon: QrCode },
] as const;

export default function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("common.home");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
      <h1 className="text-ink max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
        {t("title")}
      </h1>
      <p className="text-muted mt-4 max-w-2xl text-lg">{t("subtitle")}</p>

      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {features.map(({ key, Icon }) => (
          <li key={key}>
            <Card className="h-full p-6">
              <Icon aria-hidden className="text-brand-600 size-6" />
              <h2 className="text-ink mt-4 text-lg font-semibold">{t(`features.${key}.title`)}</h2>
              <p className="text-muted mt-2 text-sm">{t(`features.${key}.description`)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
