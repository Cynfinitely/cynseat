import { eq } from "drizzle-orm";
import { defaultTicketDesign, type TicketDesign } from "../../../domain/events/ticket-design";
import { detectImageType, MAX_IMAGE_BYTES } from "../../../domain/images/detect";
import { authorizeOrg } from "../../authz/authorize";
import type { Db } from "../../db/client";
import { eventTicketDesigns } from "../../db/schema";
import { invalid } from "../../errors";
import type { OrgContext } from "../orgs/service";
import { getOrgEvent } from "../events/service";
import type { Clock } from "../../ports/clock";

export async function getTicketDesign(db: Db, eventId: string): Promise<TicketDesign> {
  const [design] = await db
    .select()
    .from(eventTicketDesigns)
    .where(eq(eventTicketDesigns.eventId, eventId));
  return design ?? defaultTicketDesign;
}

export async function saveTicketDesign(
  deps: { db: Db; clock: Clock },
  ctx: OrgContext,
  eventId: string,
  settings: Omit<TicketDesign, "artwork">,
  file: File | null,
  remove: boolean,
) {
  authorizeOrg(ctx, "event.manage");
  await getOrgEvent(deps, ctx, eventId);
  let artwork: string | null | undefined = remove ? null : undefined;
  if (file?.size) {
    if (file.size > MAX_IMAGE_BYTES) throw invalid("image_too_large");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!detectImageType(bytes)) throw invalid("image_type");
    try {
      const { default: sharp } = await import("sharp");
      const normalized = await sharp(bytes, { limitInputPixels: 24_000_000 })
        .rotate()
        .resize({ width: 1440, height: 1800, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 82 })
        .toBuffer();
      artwork = normalized.toString("base64");
    } catch {
      throw invalid("image_type");
    }
  }
  const changes = { ...settings, artwork };
  await deps.db
    .insert(eventTicketDesigns)
    .values({ eventId, ...changes })
    .onConflictDoUpdate({ target: eventTicketDesigns.eventId, set: changes });
}
