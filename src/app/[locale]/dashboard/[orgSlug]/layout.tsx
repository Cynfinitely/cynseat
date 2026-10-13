import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { requireOrgContext } from "@/app/_lib/session";
import { StatusBadge } from "@/components/status-badge";
import { Alert } from "@/components/ui/alert";
import { OrgNav } from "@/features/orgs/org-nav";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/permissions";

type Props = { children: ReactNode; params: Promise<{ orgSlug: string }> };

export default async function OrgLayout({ children, params }: Props) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("dashboard");
  const base = `/dashboard/${ctx.organization.slug}`;
  const { approvalStatus, approvalNote } = ctx.profile;

  const items = [
    { href: base, label: t("nav.overview"), show: true },
    { href: `${base}/events`, label: t("nav.events"), show: can(ctx.role, "event.view") },
    { href: `${base}/members`, label: t("nav.members"), show: can(ctx.role, "org.members.view") },
    {
      href: `${base}/settings`,
      label: t("nav.settings"),
      show: can(ctx.role, "org.settings.update"),
    },
  ].filter((item) => item.show);

  return (
    <>
      <p className="text-sm">
        <Link href="/dashboard" className="text-muted hover:text-ink underline">
          {t("nav.all")}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="text-ink text-2xl font-semibold tracking-tight">{ctx.organization.name}</p>
        <StatusBadge status={approvalStatus} />
      </div>

      {approvalStatus !== "approved" ? (
        <Alert
          tone={approvalStatus === "pending" ? "warning" : "danger"}
          title={t(`banner.${approvalStatus}Title`)}
          className="mt-4"
        >
          <p>{t(`banner.${approvalStatus}Body`)}</p>
          {approvalNote ? <p className="mt-1">{t("banner.note", { note: approvalNote })}</p> : null}
        </Alert>
      ) : null}

      <div className="mt-6">
        <OrgNav label={t("nav.label")} items={items} />
      </div>
      <div className="pt-8">{children}</div>
    </>
  );
}
