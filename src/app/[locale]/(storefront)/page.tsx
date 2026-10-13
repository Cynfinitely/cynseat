import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EventCard } from "@/features/storefront/event-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getApp } from "@/server";
import { listUpcomingEvents } from "@/server/modules/events/public";

// The listing depends on the current time and on what organizers have just published.
export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const events = await listUpcomingEvents(getApp(), { locale, limit: 24 });
  const t = await getTranslations("common.home");
  const tStore = await getTranslations("storefront.home");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-ink max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
        {t("title")}
      </h1>
      <p className="text-muted mt-4 max-w-2xl text-lg">{t("subtitle")}</p>

      <section aria-labelledby="upcoming-title" className="mt-12">
        <h2 id="upcoming-title" className="text-ink text-2xl font-semibold tracking-tight">
          {tStore("upcoming")}
        </h2>
        {events.length === 0 ? (
          <p className="text-muted mt-4">{tStore("empty")}</p>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="bg-surface-muted mt-16 p-8">
        <h2 className="text-ink text-xl font-semibold">{tStore("organizersTitle")}</h2>
        <p className="text-muted mt-2 max-w-2xl">{tStore("organizersBody")}</p>
        <Link href="/dashboard/new" className={buttonVariants({ className: "mt-5" })}>
          {tStore("organizersAction")}
        </Link>
      </Card>
    </div>
  );
}
