import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/app/_lib/session";
import { SignUpForm } from "@/features/auth/sign-up-form";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getSafeReturnUrl } from "@/lib/safe-redirect";

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ returnUrl?: string | string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("title") };
}

export default async function SignUpPage({ params, searchParams }: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const returnUrl = getSafeReturnUrl(query.returnUrl, "/dashboard");
  if ((await getActor()).kind === "user") redirect({ href: returnUrl, locale });
  const t = await getTranslations("auth.signUp");

  return (
    <>
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-2 mb-8">{t("subtitle")}</p>
      <SignUpForm returnUrl={returnUrl} />
      <p className="text-muted mt-6 text-sm">
        {t("haveAccount")}{" "}
        <Link
          href={{ pathname: "/sign-in", query: { returnUrl } }}
          className="text-brand-700 font-medium underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </>
  );
}
