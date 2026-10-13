import { getApp } from "@/server";
import { getUnavailableSeatIds } from "@/server/modules/seatmaps/service";

/**
 * Which seats of an event cannot be chosen right now. Polled by every open seat picker,
 * so it is small and briefly cached at the edge: a thousand viewers cost about one query
 * every two seconds. Being a moment stale is harmless, since the hold itself is checked.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  const unavailable = await getUnavailableSeatIds(getApp().db, (await params).eventId);
  return Response.json(
    { unavailable },
    { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5" } },
  );
}
