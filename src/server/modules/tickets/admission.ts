import type { ContentLocale } from "@/domain/events/types";
import { getTranslations } from "next-intl/server";

export async function ticketAdmission(
  locale: ContentLocale,
  event: { minimumAge: number | null; doorsAt: Date | null; timezone: string },
) {
  const t = await getTranslations({ locale, namespace: "storefront.event" });
  const lines: string[] = [];
  if (event.minimumAge) lines.push(t("ageLimit", { age: event.minimumAge }));
  if (event.doorsAt) {
    const time = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: event.timezone,
    }).format(event.doorsAt);
    lines.push(t("doors", { time }));
  }
  return lines;
}
