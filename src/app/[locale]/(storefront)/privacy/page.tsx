import type { Metadata } from "next";
import { getLegalDocument, LegalDocument } from "@/features/legal/legal-document";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const document = getLegalDocument(locale, "privacy");
  return { title: document.title, description: document.description };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  return <LegalDocument locale={locale} kind="privacy" />;
}
