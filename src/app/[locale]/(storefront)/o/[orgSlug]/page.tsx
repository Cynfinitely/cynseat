import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { EventCard } from "@/features/storefront/event-card";
import type { Locale } from "@/i18n/routing";
import { getApp } from "@/server";
import { getPublicOrganization } from "@/server/modules/events/public";

type Props = { params: Promise<{ locale: Locale; orgSlug: string }> };

export const dynamic = "force-dynamic";

const load = cache((orgSlug: string, locale: Locale) =>
  getPublicOrganization(getApp(), orgSlug, locale),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, orgSlug } = await params;
  const org = await load(orgSlug, locale);
  return org ? { title: org.name, description: org.description ?? undefined } : {};
}

export default async function OrganizationPage({ params }: Props) {
  const { locale, orgSlug } = await params;
  const org = await load(orgSlug, locale);
  if (!org) notFound();
  const t = await getTranslations("storefront.org");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-ink text-3xl font-semibold tracking-tight sm:text-4xl">{org.name}</h1>
      {org.description ? <p className="text-muted mt-3 max-w-2xl">{org.description}</p> : null}
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        {org.website ? (
          <div>
            <dt className="text-muted">{t("website")}</dt>
            <dd>
              <a href={org.website} rel="noopener nofollow" className="text-brand-700 underline">
                {org.website.replace(/^https?:\/\//, "")}
              </a>
            </dd>
          </div>
        ) : null}
        {org.contactEmail ? (
          <div>
            <dt className="text-muted">{t("contact")}</dt>
            <dd>
              <a href={`mailto:${org.contactEmail}`} className="text-brand-700 underline">
                {org.contactEmail}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="org-events" className="mt-10">
        <h2 id="org-events" className="text-ink text-2xl font-semibold tracking-tight">
          {t("events")}
        </h2>
        {org.events.length === 0 ? (
          <p className="text-muted mt-4">{t("empty")}</p>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {org.events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} showOrganizer={false} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
