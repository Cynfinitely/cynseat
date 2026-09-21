import { useTranslation } from "react-i18next";

export type TicketCardTicket = {
  seatCode: string;
  imageUrl?: string;
};

export default function TicketCard({ ticket }: { ticket: TicketCardTicket }) {
  const { t } = useTranslation();
  const seatNumber = ticket.seatCode.replace("SEAT-", "");

  return (
    <article className="card flex flex-col justify-between p-5">
      <div>
        <p className="text-sm text-gray-500">{t("about.title")}</p>
        <h3 className="mt-1 text-xl font-semibold text-gray-900">
          {t("seatLabel")} {seatNumber}
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          {t("eventDate")} · {t("eventTime")}
        </p>
        <p className="text-sm text-gray-600">{t("eventVenue")}</p>
      </div>
      <div className="mt-4">
        {ticket.imageUrl ? (
          <a
            href={ticket.imageUrl}
            download={`ticket-${ticket.seatCode}.pdf`}
            className="btn-primary"
          >
            {t("downloadPDF")}
          </a>
        ) : (
          <p className="text-sm text-gray-500">{t("notAvailable")}</p>
        )}
      </div>
    </article>
  );
}
