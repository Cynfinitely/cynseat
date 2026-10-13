import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FindTicketsForm } from "@/features/account/find-tickets-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.find");
  return { title: t("title") };
}

export default async function FindTicketsPage() {
  const t = await getTranslations("account.find");
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-2 mb-8">{t("intro")}</p>
      <FindTicketsForm />
    </div>
  );
}
