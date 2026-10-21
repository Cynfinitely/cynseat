import { CalendarDays, MapPin } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/domain/money/money";
import { Link } from "@/i18n/navigation";
import type { PublicEventCard } from "@/server/modules/events/public";

export function EventCard({
  event,
  showOrganizer = true,
}: {
  event: PublicEventCard;
  showOrganizer?: boolean;
}) {
  const t = useTranslations("storefront.card");
  const tCategories = useTranslations("common.categories");
  const format = useFormatter();
  const locale = useLocale();
  // Organizer text may be in another language than the page; say so for screen readers.
  const contentLang = event.contentLocale === locale ? undefined : event.contentLocale;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {event.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- organizer uploads, sized by CSS
        <img src={event.coverImageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="bg-brand-50 text-brand-700 flex aspect-[16/9] items-center justify-center"
        >
          <CalendarDays className="size-10" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-brand-700 text-xs font-semibold tracking-wide uppercase">
          {tCategories(event.category)}
        </p>
        <h3 className="text-ink text-lg font-semibold" lang={contentLang}>
          <Link
            href={`/o/${event.organization.slug}/e/${event.slug}`}
            className="hover:text-brand-700 hover:underline"
          >
            {event.title}
          </Link>
        </h3>
        {showOrganizer ? (
          <p className="text-muted text-sm">{t("by", { organization: event.organization.name })}</p>
        ) : null}
        <p className="flex items-center gap-2 text-sm">
          <CalendarDays aria-hidden className="text-muted size-4 shrink-0" />
          {format.dateTime(event.startsAt, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: event.timezone,
          })}
        </p>
        <p className="flex items-center gap-2 text-sm">
          <MapPin aria-hidden className="text-muted size-4 shrink-0" />
          {event.venue ? `${event.venue.name}, ${event.venue.city}` : t("online")}
        </p>
        {event.fromPrice !== null ? (
          <p className="text-ink mt-auto pt-2 font-semibold">
            {event.fromPrice === 0
              ? t("free")
              : t("from", { price: formatMoney(event.fromPrice, event.currency, locale) })}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
