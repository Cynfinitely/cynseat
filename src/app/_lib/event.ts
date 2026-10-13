import { notFound } from "next/navigation";
import { cache } from "react";
import { getApp } from "@/server";
import { getOrgEvent, type OrgEventDetail } from "@/server/modules/events/service";
import type { OrgContext } from "@/server/modules/orgs/service";
import { pageResult, requireOrgContext } from "./session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The event in the URL with everything its editor needs, or a 404 page. */
export const requireOrgEvent = cache(
  async (
    orgSlug: string,
    eventId: string,
  ): Promise<{ ctx: OrgContext; detail: OrgEventDetail }> => {
    const ctx = await requireOrgContext(orgSlug);
    // A malformed id can never match an event.
    if (!UUID.test(eventId)) notFound();
    const detail = await pageResult(`/dashboard/${orgSlug}/events`, () =>
      getOrgEvent(getApp(), ctx, eventId),
    );
    return { ctx, detail };
  },
);
