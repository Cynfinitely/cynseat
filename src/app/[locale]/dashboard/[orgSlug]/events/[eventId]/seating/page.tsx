import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgEvent } from "@/app/_lib/event";
import { EventSeatingManager } from "@/features/seating/event-seating-manager";
import { SeatMapChooser } from "@/features/seating/seat-map-chooser";
import { getApp } from "@/server";
import { can } from "@/server/authz/permissions";
import { getEventSeating, listSeatMaps } from "@/server/modules/seatmaps/service";

type Props = { params: Promise<{ orgSlug: string; eventId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seating.event");
  return { title: t("title") };
}

export default async function EventSeatingPage({ params }: Props) {
  const { orgSlug, eventId } = await params;
  const { ctx, detail } = await requireOrgEvent(orgSlug, eventId);
  const app = getApp();
  const { event } = detail;
  const seating = await getEventSeating(app.db, ctx, event.id);
  const t = await getTranslations("seating.event");
  const canManage = can(ctx.role, "event.manage") && event.status !== "cancelled";
  const sold = detail.ticketTypes.some((type) => type.qtySold > 0 || type.qtyHeld > 0);

  return (
    <>
      <h2 className="text-ink mb-3 text-lg font-semibold">{t("title")}</h2>
      {seating ? (
        <EventSeatingManager
          orgSlug={orgSlug}
          eventId={event.id}
          currency={event.currency}
          seating={seating}
          editable={event.status === "draft" && !sold}
          canManage={canManage}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-muted">{t("none")}</p>
          {!event.venueId ? (
            <p className="text-sm font-medium">{t("needVenue")}</p>
          ) : event.status !== "draft" ? (
            <p className="text-sm font-medium">{t("locked")}</p>
          ) : canManage && can(ctx.role, "seatmap.manage") ? (
            <SeatMapChooser
              orgSlug={orgSlug}
              eventId={event.id}
              venueId={event.venueId}
              maps={(await listSeatMaps(app.db, ctx, { venueId: event.venueId })).map(
                ({ id, name, seatCount }) => ({ id, name, seatCount }),
              )}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
