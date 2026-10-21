import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { Link } from "@/i18n/navigation";

type Props = { searchParams: Promise<{ token?: string; error?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token, error } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <>
      <h1 className="text-ink mb-8 text-3xl font-semibold tracking-tight">{t("reset.title")}</h1>
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <Alert tone="danger" title={t("reset.invalidTitle")}>
            {t("reset.invalidBody")}
          </Alert>
          <Link href="/forgot-password" className={buttonVariants({ variant: "secondary" })}>
            {t("forgot.submit")}
          </Link>
        </div>
      )}
    </>
  );
}
