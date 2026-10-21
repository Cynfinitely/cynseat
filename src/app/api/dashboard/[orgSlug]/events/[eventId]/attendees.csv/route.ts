import { headers } from "next/headers";
import { toCsv } from "@/domain/csv/csv";
import { toZonedInput } from "@/domain/time/zoned";
import { getApp } from "@/server";
import { AppError } from "@/server/errors";
import { getOrgEvent } from "@/server/modules/events/service";
import { getOrgContext } from "@/server/modules/orgs/service";
import { exportAttendees } from "@/server/modules/refunds/service";

export const dynamic = "force-dynamic";

/** The attendee list of an event as a spreadsheet file, for organization admins. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; eventId: string }> },
): Promise<Response> {
  const { orgSlug, eventId } = await params;
  const app = getApp();
  try {
    const ctx = await getOrgContext(app.db, await app.resolveActor(await headers()), orgSlug);
    const rows = await exportAttendees(app, ctx, eventId);
    const { event } = await getOrgEvent(app, ctx, eventId);
    // Times in the event's own zone, which is what the organizer plans in.
    const local = (date: Date | null) =>
      date ? toZonedInput(date, event.timezone).replace("T", " ") : "";

    const csv = toCsv(
      [
        "Order",
        "Name",
        "Email",
        "Ticket",
        "Section",
        "Row",
        "Seat",
        "Status",
        "Checked in",
        "Purchased",
      ],
      rows.map((row) => [
        row.reference,
        row.buyerName,
        row.email,
        row.ticketType,
        row.section,
        row.row,
        row.seat,
        row.status,
        local(row.checkedInAt),
        local(row.purchasedAt),
      ]),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendees-${event.slug}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      // Signed out, not a member, not an admin, or no such event: all look the same.
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
