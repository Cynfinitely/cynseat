import { ArrowDown, ArrowUpRight, CalendarDays } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
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
      <section className="home-hero">
        <div>
          <h1 className="text-ink">{t("title")}</h1>
          <p className="text-muted mt-6 max-w-md text-lg leading-relaxed">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/dashboard/new" className={buttonVariants()}>
              {tStore("organizersAction")} <ArrowUpRight aria-hidden className="size-4" />
            </Link>
            <a href="#upcoming-title" className={buttonVariants({ variant: "ghost" })}>
              {tStore("upcoming")} <ArrowDown aria-hidden className="size-4" />
            </a>
          </div>
        </div>
        <Image
          src="/community-hall.webp"
          alt=""
          width={1200}
          height={900}
          preload
          sizes="(min-width: 768px) 50vw, 100vw"
          className="aspect-[4/3] w-full rounded-lg object-cover"
        />
      </section>
      <section
        aria-labelledby="upcoming-title"
        className="border-line mt-12 border-t pt-8 sm:mt-16"
      >
        <h2 id="upcoming-title" className="text-ink text-3xl sm:text-4xl">
          {tStore("upcoming")}
        </h2>
        {events.length === 0 ? (
          <p className="text-muted bg-surface border-line mt-6 flex items-center gap-4 rounded-lg border p-6">
            <CalendarDays aria-hidden className="text-brand-600 size-5 shrink-0" />
            {tStore("empty")}
          </p>
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
    </div>
  );
}
