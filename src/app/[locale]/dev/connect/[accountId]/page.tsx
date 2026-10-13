import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { completeFakeOnboardingAction } from "@/features/payments/fake-connect-actions";
import { getFakeGateway } from "@/server";

type Props = {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ return?: string }>;
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

/** Stands in for the provider's onboarding form. Exists only with PAYMENTS_DRIVER=fake. */
export default async function FakeConnectPage({ params, searchParams }: Props) {
  const { accountId } = await params;
  if (!getFakeGateway()?.accounts.has(accountId)) notFound();
  const returnUrl = (await searchParams).return ?? "/";
  const t = await getTranslations("checkout.fake");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("connectTitle")}</h1>
      <Alert tone="warning" className="mt-4">
        {t("connectBody")}
      </Alert>
      <form action={completeFakeOnboardingAction.bind(null, accountId, returnUrl)} className="mt-6">
        <Button type="submit">{t("connectDone")}</Button>
      </form>
    </div>
  );
}
