import { Alert } from "@/components/ui/alert";
import type { Locale } from "@/i18n/routing";
import { env } from "@/lib/env";
import en from "../../../messages/en/legal.json";
import fi from "../../../messages/fi/legal.json";
import tr from "../../../messages/tr/legal.json";

// Read here on the server rather than through next-intl: the text is long and only these two
// pages need it, so it should not be sent to the browser with every other page.
const content: Record<Locale, typeof en> = { en, fi, tr };

export type LegalDocumentKind = "privacy" | "terms";

export function getLegalDocument(locale: Locale, kind: LegalDocumentKind) {
  return content[locale][kind];
}

function fill(text: string, notSet: string): string {
  const values: Record<string, string | number> = {
    operator: env.LEGAL_OPERATOR_NAME ?? notSet,
    country: env.LEGAL_COUNTRY ?? notSet,
    contact: env.LEGAL_CONTACT_EMAIL ?? notSet,
    personalDays: env.RETENTION_PERSONAL_DATA_DAYS,
    emailDays: env.RETENTION_SENT_EMAIL_DAYS,
    paymentDays: env.RETENTION_PAYMENT_EVENT_DAYS,
  };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

export function LegalDocument({ locale, kind }: { locale: Locale; kind: LegalDocumentKind }) {
  const messages = content[locale];
  const document = messages[kind];

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{document.title}</h1>
      <p className="text-muted mt-2 text-sm">{messages.updated}</p>
      <Alert tone="warning" className="mt-6">
        {messages.draft}
      </Alert>
      <p className="text-ink mt-8">{fill(document.intro, messages.notSet)}</p>
      {Object.entries(document.sections).map(([key, section]) => (
        <section key={key} aria-labelledby={`${kind}-${key}`} className="mt-10">
          <h2 id={`${kind}-${key}`} className="text-ink text-xl font-semibold tracking-tight">
            {section.heading}
          </h2>
          {fill(section.body, messages.notSet)
            .split("\n\n")
            .map((paragraph, index) => (
              <p key={index} className="text-ink mt-3 leading-relaxed">
                {paragraph}
              </p>
            ))}
        </section>
      ))}
    </article>
  );
}
