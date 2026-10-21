import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/app/_lib/session";
import { OrgProfileForm } from "@/features/orgs/org-profile-form";
import { can } from "@/server/authz/permissions";

type Props = { params: Promise<{ orgSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.settings");
  return { title: t("title") };
}

export default async function OrgSettingsPage({ params }: Props) {
  const ctx = await requireOrgContext((await params).orgSlug);
  if (!can(ctx.role, "org.settings.update")) notFound();
  const t = await getTranslations("dashboard.settings");
  const { profile } = ctx;

  return (
    <div className="max-w-xl">
      <h1 className="text-ink mb-4 text-xl font-semibold">{t("title")}</h1>
      <OrgProfileForm
        orgSlug={ctx.organization.slug}
        initial={{
          contactEmail: profile.contactEmail ?? "",
          country: profile.country ?? "",
          legalName: profile.legalName ?? "",
          businessId: profile.businessId ?? "",
          website: profile.website ?? "",
          description: profile.description ?? "",
        }}
      />
    </div>
  );
}
