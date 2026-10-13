import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgEvent } from "@/app/_lib/event";
import { Card } from "@/components/ui/card";
import { VenuePicker } from "@/features/events/venue-picker";
import { can } from "@/server/authz/permissions";

type Props = { params: Promise<{ orgSlug: string; eventId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.venue");
  return { title: t("title") };
}

export default async function EventVenuePage({ params }: Props) {
  const { orgSlug, eventId } = await params;
  const { ctx, detail } = await requireOrgEvent(orgSlug, eventId);
  const t = await getTranslations("events.venue");
  const { event } = detail;
  const venue = event.venueSnapshot;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-muted text-sm">{t("current")}</h2>
        {venue ? (
          <p className="mt-1">
            <span className="text-ink font-semibold">{venue.name}</span>
            <br />
            <span className="text-sm">
              {venue.addressLine1}, {venue.postalCode ? `${venue.postalCode} ` : ""}
              {venue.city}
            </span>
          </p>
        ) : (
          <p className="text-ink mt-1 font-semibold">{event.isOnline ? t("online") : t("none")}</p>
        )}
      </Card>
      <VenuePicker
        orgSlug={orgSlug}
        eventId={event.id}
        eventTimezone={event.timezone}
        defaultCountry={ctx.profile.country ?? "FI"}
        hasPlace={event.isOnline || event.venueId !== null}
        isOnline={event.isOnline}
        disabled={!can(ctx.role, "event.manage") || event.status === "cancelled"}
      />
    </div>
  );
}
