import { useTranslation, Trans } from "react-i18next";
import BuyTicketsLink from "../components/BuyTicketsLink";
import PageMeta from "../components/PageMeta";
import { EVENT_POSTER_SRC } from "../lib/constants";

const About = () => {
  const { t } = useTranslation();

  const facts = [
    { label: t("dateLabel"), value: t("eventDate") },
    { label: t("timeLabel"), value: t("eventTime") },
    { label: t("venueLabel"), value: t("eventVenue") },
    { label: t("ageLimitLabel"), value: t("ageLimit") },
    { label: t("durationLabel"), value: t("durationValue") },
    { label: t("about.artist"), value: t("about.artistName") },
    { label: t("ticketPriceLabel"), value: t("ticketPrice") },
    { label: t("conceptLabel"), value: t("conceptValue") },
  ];

  return (
    <div className="page pb-24 lg:pb-10">
      <PageMeta title={t("about.title")} description={t("about.paragraph1")} />
      <div className="page-wide max-w-3xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title">{t("about.title")}</h1>
            <p className="mt-2 text-lg text-gray-600">{t("about.paragraph1")}</p>
          </div>
          <BuyTicketsLink className="btn-primary hidden sm:inline-flex" />
        </div>

        <img
          src={EVENT_POSTER_SRC}
          alt={t("featuredEventAlt")}
          className="mb-8 max-h-[420px] w-full rounded-xl object-cover object-top"
        />

        <dl className="card mb-10 grid gap-4 p-6 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-sm text-gray-500">{fact.label}</dt>
              <dd className="font-medium text-gray-900">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-5 text-lg leading-relaxed text-gray-700">
          <p>
            <Trans i18nKey="about.paragraph2" />
          </p>
          <p>
            <Trans i18nKey="about.paragraph3" />
          </p>
          <p>
            <Trans i18nKey="about.paragraph4" />
          </p>
          <p>
            <Trans i18nKey="about.paragraph5" />
          </p>
          <p>
            <Trans i18nKey="about.paragraph6" />
          </p>
          <p>
            <Trans i18nKey="about.paragraph7" />
          </p>
          <p>
            <Trans i18nKey="about.paragraph8" />
          </p>
          <p>
            <Trans i18nKey="about.paragraph9" />
          </p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white p-3 sm:hidden">
        <BuyTicketsLink className="btn-primary w-full" />
      </div>
    </div>
  );
};

export default About;
