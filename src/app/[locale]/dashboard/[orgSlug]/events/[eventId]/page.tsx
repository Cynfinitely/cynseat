import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgEvent } from "@/app/_lib/event";
import { isContentLocale, type ContentLocale } from "@/domain/events/types";
import { toZonedInput } from "@/domain/time/zoned";
import { EventContentEditor, type TranslationValues } from "@/features/events/event-content-editor";
import { EventDetailsForm } from "@/features/events/event-details-form";
import { can } from "@/server/authz/permissions";

type Props = { params: Promise<{ orgSlug: string; eventId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.nav");
  return { title: t("details") };
}

export default async function EventDetailsPage({ params }: Props) {
  const { orgSlug, eventId } = await params;
  const { ctx, detail } = await requireOrgEvent(orgSlug, eventId);
  const t = await getTranslations("events");
  const { event } = detail;
  const disabled = !can(ctx.role, "event.manage") || event.status === "cancelled";
  const local = (date: Date | null) => (date ? toZonedInput(date, event.timezone) : "");

  const translations: Partial<Record<ContentLocale, TranslationValues>> = {};
  for (const row of detail.translations) {
    if (isContentLocale(row.locale)) {
      translations[row.locale] = {
        title: row.title,
        summary: row.summary ?? "",
        description: row.description ?? "",
      };
    }
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="content-title">
        <h2 id="content-title" className="text-ink mb-3 text-lg font-semibold">
          {t("content.title")}
        </h2>
        <EventContentEditor
          orgSlug={orgSlug}
          eventId={event.id}
          defaultLocale={isContentLocale(event.defaultLocale) ? event.defaultLocale : "en"}
          translations={translations}
          disabled={disabled}
        />
      </section>
      <section aria-labelledby="details-title">
        <h2 id="details-title" className="text-ink mb-3 text-lg font-semibold">
          {t("details.title")}
        </h2>
        <EventDetailsForm
          orgSlug={orgSlug}
          eventId={event.id}
          disabled={disabled}
          initial={{
            category: event.category,
            visibility: event.visibility,
            timezone: event.timezone,
            startsAt: local(event.startsAt),
            endsAt: local(event.endsAt),
            doorsAt: local(event.doorsAt),
            currency: event.currency,
            maxTicketsPerOrder: String(event.maxTicketsPerOrder),
          }}
        />
      </section>
    </div>
  );
}
