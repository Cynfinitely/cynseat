import { useTranslations } from "next-intl";
import type { ApprovalStatus } from "@/domain/orgs/status";
import { Badge, type BadgeTone } from "./ui/badge";

const tones: Record<ApprovalStatus, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  suspended: "danger",
};

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  const t = useTranslations("common.status");
  return <Badge tone={tones[status]}>{t(status)}</Badge>;
}
