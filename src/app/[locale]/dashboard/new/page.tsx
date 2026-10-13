import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUserOrRedirect } from "@/app/_lib/session";
import { RegisterOrgForm } from "@/features/orgs/register-org-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.register");
  return { title: t("title") };
}

export default async function NewOrganizationPage() {
  const actor = await requireUserOrRedirect("/dashboard/new");
  const t = await getTranslations("dashboard.register");

  return (
    <div className="max-w-xl">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-2 mb-8">{t("subtitle")}</p>
      <RegisterOrgForm contactEmail={actor.email} />
    </div>
  );
}
