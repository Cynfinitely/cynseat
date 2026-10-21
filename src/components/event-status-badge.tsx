import { useTranslations } from "next-intl";
import type { EventStatus } from "@/domain/events/types";
import { Badge, type BadgeTone } from "./ui/badge";

const tones: Record<EventStatus, BadgeTone> = {
  draft: "neutral",
  published: "success",
  cancelled: "danger",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const t = useTranslations("common.eventStatus");
  return <Badge tone={tones[status]}>{t(status)}</Badge>;
}
