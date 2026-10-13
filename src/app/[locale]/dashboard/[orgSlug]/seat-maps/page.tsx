import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { pageResult, requireOrgContext } from "@/app/_lib/session";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getApp } from "@/server";
import { listSeatMaps } from "@/server/modules/seatmaps/service";

type Props = { params: Promise<{ orgSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seating.maps");
  return { title: t("title") };
}

export default async function SeatMapsPage({ params }: Props) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const maps = await pageResult(`/dashboard/${orgSlug}/seat-maps`, () =>
    listSeatMaps(getApp().db, ctx),
  );
  const t = await getTranslations("seating.maps");
  const format = await getFormatter();

  return (
    <>
      <h1 className="text-ink text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted mt-2 max-w-2xl text-sm">{t("intro")}</p>
      {maps.length === 0 ? (
        <p className="text-muted mt-6">{t("empty")}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((map) => (
            <li key={map.id}>
              <Card className="flex h-full flex-col gap-1 p-5">
                <h2 className="text-ink font-semibold">
                  <Link
                    href={`/dashboard/${orgSlug}/seat-maps/${map.id}`}
                    className="text-brand-700 underline"
                  >
                    {map.name}
                  </Link>
                </h2>
                <p className="text-muted text-sm">{map.venueName}</p>
                <p className="text-sm">{t("seats", { count: map.seatCount })}</p>
                <p className="text-muted mt-auto pt-2 text-xs">
                  {format.dateTime(map.updatedAt, { dateStyle: "medium" })}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
