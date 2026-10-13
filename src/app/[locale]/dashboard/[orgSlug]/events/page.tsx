import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { pageResult, requireOrgContext } from "@/app/_lib/session";
import { EventStatusBadge } from "@/components/event-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getApp } from "@/server";
import { can } from "@/server/authz/permissions";
import { listOrgEvents } from "@/server/modules/events/service";

type Props = { params: Promise<{ orgSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.list");
  return { title: t("title") };
}

export default async function EventsPage({ params }: Props) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const base = `/dashboard/${orgSlug}/events`;
  const events = await pageResult(base, () => listOrgEvents(getApp().db, ctx));
  const t = await getTranslations("events.list");
  const format = await getFormatter();
  const canManage = can(ctx.role, "event.manage");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink text-xl font-semibold">{t("title")}</h1>
        {canManage ? (
          <Link href={`${base}/new`} className={buttonVariants()}>
            {t("new")}
          </Link>
        ) : null}
      </div>

      {events.length === 0 ? (
        <Card className="mt-6 p-8 text-center">
          <h2 className="text-ink text-lg font-semibold">{t("emptyTitle")}</h2>
          <p className="text-muted mt-2">{t("emptyBody")}</p>
        </Card>
      ) : (
        <div className="border-line mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("event")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("date")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("status")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("sold")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {events.map((event) => (
                <tr key={event.id}>
                  <th scope="row" className="px-4 py-3 font-medium">
                    <Link href={`${base}/${event.id}`} className="text-brand-700 underline">
                      {event.title ?? t("untitled")}
                    </Link>
                  </th>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {format.dateTime(event.startsAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: event.timezone,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <EventStatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {event.sold} / {event.capacity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
