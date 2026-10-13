import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { requireOrgEvent } from "@/app/_lib/event";
import { EventStatusBadge } from "@/components/event-status-badge";
import { OrgNav } from "@/features/orgs/org-nav";
import { PublishPanel } from "@/features/events/publish-panel";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/permissions";

type Props = { children: ReactNode; params: Promise<{ orgSlug: string; eventId: string }> };

export default async function EventLayout({ children, params }: Props) {
  const { orgSlug, eventId } = await params;
  const { ctx, detail } = await requireOrgEvent(orgSlug, eventId);
  const t = await getTranslations("events");
  const { event } = detail;
  const base = `/dashboard/${orgSlug}/events/${event.id}`;
  const title =
    detail.translations.find((row) => row.locale === event.defaultLocale)?.title ??
    t("list.untitled");

  return (
    <>
      <p className="text-sm">
        <Link href={`/dashboard/${orgSlug}/events`} className="text-muted hover:text-ink underline">
          {t("nav.back")}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-ink text-xl font-semibold" lang={event.defaultLocale}>
          {title}
        </h1>
        <EventStatusBadge status={event.status} />
      </div>
      <div className="mt-4">
        <OrgNav
          label={t("nav.label")}
          items={[
            { href: base, label: t("nav.details") },
            { href: `${base}/venue`, label: t("nav.venue") },
            { href: `${base}/tickets`, label: t("nav.tickets") },
            ...(can(ctx.role, "order.view")
              ? [{ href: `${base}/orders`, label: t("nav.orders") }]
              : []),
            ...(can(ctx.role, "checkin.scan")
              ? [{ href: `${base}/check-in`, label: t("nav.checkin") }]
              : []),
          ]}
        />
      </div>
      <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">{children}</div>
        <aside>
          <PublishPanel
            orgSlug={orgSlug}
            eventId={event.id}
            eventSlug={event.slug}
            status={event.status}
            problems={detail.publishProblems}
            canPublish={can(ctx.role, "event.publish")}
            canManage={can(ctx.role, "event.manage")}
            deletable={event.publishedAt === null}
          />
        </aside>
      </div>
    </>
  );
}
