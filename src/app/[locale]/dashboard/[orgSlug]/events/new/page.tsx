import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/app/_lib/session";
import { isContentLocale } from "@/domain/events/types";
import { CreateEventForm } from "@/features/events/create-event-form";
import { can } from "@/server/authz/permissions";

type Props = { params: Promise<{ orgSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.create");
  return { title: t("title") };
}

export default async function NewEventPage({ params }: Props) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.role, "event.manage")) notFound();
  const t = await getTranslations("events.create");
  const locale = await getLocale();

  return (
    <div className="max-w-xl">
      <h1 className="text-ink text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted mt-2 mb-6">{t("subtitle")}</p>
      <CreateEventForm
        orgSlug={orgSlug}
        locale={isContentLocale(locale) ? locale : "en"}
        timezone={ctx.profile.defaultTimezone}
      />
    </div>
  );
}
