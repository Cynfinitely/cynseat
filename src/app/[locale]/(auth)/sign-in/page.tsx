import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/app/_lib/session";
import { SignInForm } from "@/features/auth/sign-in-form";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getSafeReturnUrl } from "@/lib/safe-redirect";

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ returnUrl?: string | string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("title") };
}

export default async function SignInPage({ params, searchParams }: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const returnUrl = getSafeReturnUrl(query.returnUrl, "/dashboard");
  if ((await getActor()).kind === "user") redirect({ href: returnUrl, locale });
  const t = await getTranslations("auth.signIn");

  return (
    <>
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-2 mb-8">{t("subtitle")}</p>
      <SignInForm returnUrl={returnUrl} />
      <p className="text-muted mt-6 text-sm">
        {t("noAccount")}{" "}
        <Link
          href={{ pathname: "/sign-up", query: { returnUrl } }}
          className="text-brand-700 font-medium underline"
        >
          {t("createAccount")}
        </Link>
      </p>
    </>
  );
}
