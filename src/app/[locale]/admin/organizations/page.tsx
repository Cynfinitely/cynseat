import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getActor, pageResult } from "@/app/_lib/session";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { ReviewForm } from "@/features/admin/review-form";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { getApp } from "@/server";
import { approvalStatuses, type ApprovalStatus } from "@/domain/orgs/status";
import { listOrganizationsForReview } from "@/server/modules/orgs/service";

type Props = { searchParams: Promise<{ status?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.orgs");
  return { title: t("title") };
}

export default async function AdminOrganizationsPage({ searchParams }: Props) {
  const requested = (await searchParams).status;
  const status: ApprovalStatus = approvalStatuses.find((value) => value === requested) ?? "pending";
  const organizations = await pageResult("/admin/organizations", async () =>
    listOrganizationsForReview(getApp().db, await getActor(), [status]),
  );
  const t = await getTranslations("admin.orgs");
  const tStatus = await getTranslations("common.status");
  const format = await getFormatter();
  const regionNames = new Intl.DisplayNames([await getLocale()], { type: "region" });

  return (
    <>
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <nav aria-label={t("filter")} className="mt-6">
        <ul className="flex flex-wrap gap-2 text-sm font-medium">
          {approvalStatuses.map((value) => (
            <li key={value}>
              <Link
                href={{ pathname: "/admin/organizations", query: { status: value } }}
                aria-current={value === status ? "page" : undefined}
                className={cn(
                  "block rounded-full border px-3 py-1.5",
                  value === status
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-line text-muted hover:text-ink",
                )}
              >
                {tStatus(value)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {organizations.length === 0 ? (
        <p className="text-muted mt-8">{t("empty")}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {organizations.map((org) => {
            const { profile } = org;
            const facts = [
              { label: t("contact"), value: profile.contactEmail },
              { label: t("country"), value: profile.country && regionNames.of(profile.country) },
              { label: t("legalName"), value: profile.legalName },
              { label: t("businessId"), value: profile.businessId },
              { label: t("website"), value: profile.website },
              { label: t("description"), value: profile.description },
            ].filter((fact) => fact.value);

            return (
              <li key={org.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-ink text-lg font-semibold">{org.name}</h2>
                      <p className="text-muted text-sm">
                        /o/{org.slug} ·{" "}
                        {t("registered", {
                          date: format.dateTime(profile.createdAt, { dateStyle: "medium" }),
                        })}
                      </p>
                    </div>
                    <StatusBadge status={profile.approvalStatus} />
                  </div>
                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {facts.map((fact) => (
                      <div key={fact.label}>
                        <dt className="text-muted">{fact.label}</dt>
                        <dd className="text-ink break-words">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {profile.approvalNote ? (
                    <p className="text-muted mt-3 text-sm">
                      {t("previousNote", { note: profile.approvalNote })}
                    </p>
                  ) : null}
                  <div className="border-line mt-4 border-t pt-4">
                    <ReviewForm
                      organizationId={org.id}
                      organizationName={org.name}
                      status={profile.approvalStatus}
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
