import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor, pageResult } from "@/app/_lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VenueModeration } from "@/features/admin/venue-moderation";
import { getApp } from "@/server";
import { listVenuesForModeration } from "@/server/modules/venues/moderation";

type Props = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.venues");
  return { title: t("title") };
}

export default async function AdminVenuesPage({ searchParams }: Props) {
  const query = ((await searchParams).q ?? "").slice(0, 80);
  const venues = await pageResult("/admin/venues", async () =>
    listVenuesForModeration(getApp(), await getActor(), query),
  );
  const t = await getTranslations("admin.venues");

  return (
    <>
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-2 text-sm">{t("intro")}</p>
      <form role="search" className="mt-6 flex max-w-md gap-2">
        <Input type="search" name="q" defaultValue={query} aria-label={t("search")} />
        <Button type="submit" variant="secondary">
          {t("searchSubmit")}
        </Button>
      </form>
      <VenueModeration
        venues={venues.map((venue) => ({
          id: venue.id,
          name: venue.name,
          address: `${venue.addressLine1}, ${venue.city}, ${venue.country}`,
          status: venue.status,
          createdBy: venue.createdByOrganization,
          events: venue.events,
        }))}
      />
    </>
  );
}
