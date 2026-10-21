import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { pageResult, requireOrgContext } from "@/app/_lib/session";
import { SeatMapEditor } from "@/features/seating/seat-map-editor";
import { Link } from "@/i18n/navigation";
import { getApp } from "@/server";
import { getSeatMap } from "@/server/modules/seatmaps/service";

type Props = { params: Promise<{ orgSlug: string; seatMapId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seating.editor");
  return { title: t("title") };
}

export default async function SeatMapEditorPage({ params }: Props) {
  const { orgSlug, seatMapId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const map = await pageResult(`/dashboard/${orgSlug}/seat-maps`, () =>
    getSeatMap(getApp().db, ctx, seatMapId),
  );
  const t = await getTranslations("seating.editor");

  return (
    <>
      <p className="text-sm">
        <Link
          href={`/dashboard/${orgSlug}/seat-maps`}
          className="text-muted hover:text-ink underline"
        >
          {t("back")}
        </Link>
      </p>
      <h1 className="text-ink mt-2 mb-1 text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted mb-4 text-sm">{map.venueName}</p>
      <SeatMapEditor
        orgSlug={orgSlug}
        seatMapId={map.id}
        initialName={map.name}
        initialLayout={map.layout}
      />
    </>
  );
}
