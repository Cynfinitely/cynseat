import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUserOrRedirect } from "@/app/_lib/session";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getApp } from "@/server";
import { listMyOrganizations } from "@/server/modules/orgs/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.orgs");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const actor = await requireUserOrRedirect("/dashboard");
  const organizations = await listMyOrganizations(getApp().db, actor);
  const t = await getTranslations("dashboard.orgs");
  const tRoles = await getTranslations("common.roles");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex gap-2">
          {actor.isPlatformAdmin ? (
            <Link href="/admin/organizations" className={buttonVariants({ variant: "secondary" })}>
              {t("platformAdmin")}
            </Link>
          ) : null}
          <Link href="/dashboard/new" className={buttonVariants()}>
            {t("register")}
          </Link>
        </div>
      </div>

      {organizations.length === 0 ? (
        <Card className="mt-8 p-8 text-center">
          <h2 className="text-ink text-lg font-semibold">{t("emptyTitle")}</h2>
          <p className="text-muted mx-auto mt-2 max-w-lg">{t("emptyBody")}</p>
        </Card>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <li key={org.id}>
              <Card className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-ink text-lg font-semibold">{org.name}</h2>
                  <StatusBadge status={org.approvalStatus} />
                </div>
                <p className="text-muted text-sm">{tRoles(org.role)}</p>
                <Link
                  href={`/dashboard/${org.slug}`}
                  className={buttonVariants({
                    variant: "secondary",
                    size: "sm",
                    className: "mt-auto self-start",
                  })}
                >
                  {t("open")}
                  <span className="sr-only"> {org.name}</span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
