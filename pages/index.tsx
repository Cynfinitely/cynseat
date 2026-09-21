import Link from "next/link";
import { useTranslation } from "react-i18next";
import BuyTicketsLink from "../components/BuyTicketsLink";
import PageMeta from "../components/PageMeta";
import { EVENT_POSTER_SRC } from "../lib/constants";

const Home: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="page">
      <PageMeta title={t("about.title")} description={t("about.paragraph1")} />
      <div className="page-wide">
        <article className="card overflow-hidden md:grid md:grid-cols-2">
          <img
            src={EVENT_POSTER_SRC}
            alt={t("featuredEventAlt")}
            className="h-full max-h-[520px] w-full object-cover object-top"
          />
          <div className="flex flex-col justify-center gap-6 p-6 sm:p-8">
            <div>
              <p className="text-sm font-medium text-purple-700">CynSeat</p>
              <h1 className="page-title mt-1">{t("about.title")}</h1>
              <p className="mt-3 text-lg text-gray-600">{t("about.paragraph1")}</p>
            </div>

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">{t("dateLabel")}</dt>
                <dd className="font-medium">{t("eventDate")}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t("timeLabel")}</dt>
                <dd className="font-medium">{t("eventTime")}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t("venueLabel")}</dt>
                <dd className="font-medium">{t("eventVenue")}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t("ticketPriceLabel")}</dt>
                <dd className="font-medium">{t("ticketPrice")}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 sm:flex-row">
              <BuyTicketsLink />
              <Link href="/about" className="btn-secondary">
                {t("viewEventDetails")}
              </Link>
            </div>

            <ul className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
              <li>{t("digitalTicketsDesc")}</li>
              <li>{t("securePaymentDesc")}</li>
              <li>{t("under12")}</li>
              <li>{t("ticketWarning2")}</li>
            </ul>
          </div>
        </article>
      </div>
    </div>
  );
};

export default Home;
