import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/app/_lib/session";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ orgSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ctx = await requireOrgContext((await params).orgSlug);
  return { title: ctx.organization.name };
}

export default async function OrgOverviewPage({ params }: Props) {
  const ctx = await requireOrgContext((await params).orgSlug);
  const t = await getTranslations("dashboard.overview");
  const tCommon = await getTranslations("common");

  const facts = [
    { label: t("yourRole"), value: tCommon(`roles.${ctx.role}`) },
    { label: t("status"), value: tCommon(`status.${ctx.profile.approvalStatus}`) },
    { label: t("publicAddress"), value: `/o/${ctx.organization.slug}` },
  ];

  return (
    <>
      <h1 className="text-ink text-xl font-semibold">{t("title")}</h1>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {facts.map((fact) => (
          <Card key={fact.label} className="p-5">
            <dt className="text-muted text-sm">{fact.label}</dt>
            <dd className="text-ink mt-1 font-semibold">{fact.value}</dd>
          </Card>
        ))}
      </dl>
      <Card className="mt-6 p-6">
        <h2 className="text-ink font-semibold">{t("comingTitle")}</h2>
        <p className="text-muted mt-1 text-sm">{t("comingBody")}</p>
        <Link
          href={`/dashboard/${ctx.organization.slug}/events`}
          className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}
        >
          {t("eventsLink")}
        </Link>
      </Card>
    </>
  );
}
