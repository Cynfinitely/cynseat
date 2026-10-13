import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");

  return (
    <>
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-2 mb-8">{t("subtitle")}</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="text-brand-700 font-medium underline">
          {t("back")}
        </Link>
      </p>
    </>
  );
}
