import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { env } from "@/lib/env";
import { getApp } from "@/server";
import { listUpcomingEvents } from "@/server/modules/events/public";

// Built when asked for: it lists what is on sale now.
export const dynamic = "force-dynamic";

/** Public pages in every language: the home page, organizers with events, the events, and
 * the privacy policy and terms. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const events = await listUpcomingEvents(getApp(), { locale: routing.defaultLocale, limit: 1000 });
  const alternates = (path: string) => ({
    languages: Object.fromEntries(
      routing.locales.map((locale) => [locale, `${base}/${locale}${path}`]),
    ),
  });
  const entry = (path: string, priority: number) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      alternates: alternates(path),
      priority,
    }));

  const organizations = [...new Set(events.map((event) => event.organization.slug))];
  return [
    ...entry("", 1),
    ...entry("/privacy", 0.2),
    ...entry("/terms", 0.2),
    ...organizations.flatMap((slug) => entry(`/o/${slug}`, 0.6)),
    ...events.flatMap((event) => entry(`/o/${event.organization.slug}/e/${event.slug}`, 0.8)),
  ];
}
