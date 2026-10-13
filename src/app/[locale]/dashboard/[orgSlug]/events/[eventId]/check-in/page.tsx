import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgEvent } from "@/app/_lib/event";
import { pageResult } from "@/app/_lib/session";
import { Scanner } from "@/features/checkin/scanner";
import { getApp } from "@/server";
import { can } from "@/server/authz/permissions";
import { getCheckInProgress } from "@/server/modules/checkin/service";

type Props = { params: Promise<{ orgSlug: string; eventId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.checkin");
  return { title: t("title") };
}

export default async function CheckInPage({ params }: Props) {
  const { orgSlug, eventId } = await params;
  const { ctx, detail } = await requireOrgEvent(orgSlug, eventId);
  const progress = await pageResult(`/dashboard/${orgSlug}/events/${eventId}/check-in`, () =>
    getCheckInProgress(getApp(), ctx, eventId),
  );
  const t = await getTranslations("events.checkin");

  return (
    <>
      <h2 className="text-ink mb-4 text-lg font-semibold">{t("title")}</h2>
      <Scanner
        orgSlug={orgSlug}
        eventId={detail.event.id}
        timezone={detail.event.timezone}
        canUndo={can(ctx.role, "checkin.undo")}
        initialProgress={progress}
      />
    </>
  );
}
