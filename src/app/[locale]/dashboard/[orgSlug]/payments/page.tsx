import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/app/_lib/session";
import { Alert } from "@/components/ui/alert";
import { ConnectButton } from "@/features/payments/connect-button";
import { getApp } from "@/server";
import { can } from "@/server/authz/permissions";
import { getOrgContext } from "@/server/modules/orgs/service";
import { paymentStatusOf, refreshPaymentStatus } from "@/server/modules/payments/service";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ returned?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.payments");
  return { title: t("title") };
}

export default async function PaymentsPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  let ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.role, "org.payments.manage")) notFound();
  const app = getApp();

  // Back from the provider's form, or still waiting on it: ask the provider where things stand.
  if ((await searchParams).returned || paymentStatusOf(ctx.profile).state === "incomplete") {
    await refreshPaymentStatus(app, ctx);
    ctx = await getOrgContext(app.db, ctx.actor, orgSlug);
  }

  const t = await getTranslations("dashboard.payments");
  const { state } = paymentStatusOf(ctx.profile);
  const approved = ctx.profile.approvalStatus === "approved";
  const fee = [
    app.platformFee.bps > 0 ? `${app.platformFee.bps / 100} %` : null,
    app.platformFee.fixedMinor > 0 ? `+${app.platformFee.fixedMinor / 100}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="max-w-2xl">
      <h1 className="text-ink text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted mt-2">{t("intro")}</p>

      <Alert
        tone={state === "ready" ? "success" : state === "incomplete" ? "warning" : "info"}
        title={t(`${state}Title`)}
        className="mt-6"
      >
        {t(`${state}Body`)}
      </Alert>

      {state !== "ready" ? (
        <div className="mt-6">
          {approved ? (
            <ConnectButton orgSlug={orgSlug} label={t(state === "none" ? "connect" : "resume")} />
          ) : (
            <p className="text-muted text-sm">{t("needsApproval")}</p>
          )}
        </div>
      ) : null}

      <p className="text-muted mt-8 text-sm">{t("fee", { fee: fee || t("noFee") })}</p>
    </div>
  );
}
