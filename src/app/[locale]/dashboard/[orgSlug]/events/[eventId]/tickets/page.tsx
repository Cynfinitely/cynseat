import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgEvent } from "@/app/_lib/event";
import { formatMoney, toMoneyInput } from "@/domain/money/money";
import { toZonedInput } from "@/domain/time/zoned";
import { TicketTypesManager } from "@/features/events/ticket-types-manager";
import { can } from "@/server/authz/permissions";

type Props = { params: Promise<{ orgSlug: string; eventId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.tickets");
  return { title: t("title") };
}

export default async function EventTicketsPage({ params }: Props) {
  const { orgSlug, eventId } = await params;
  const { ctx, detail } = await requireOrgEvent(orgSlug, eventId);
  const t = await getTranslations("events.tickets");
  const locale = await getLocale();
  const { event } = detail;
  const local = (date: Date | null) => (date ? toZonedInput(date, event.timezone) : "");

  return (
    <>
      <h2 className="text-ink mb-3 text-lg font-semibold">{t("title")}</h2>
      <TicketTypesManager
        orgSlug={orgSlug}
        eventId={event.id}
        currency={event.currency}
        disabled={!can(ctx.role, "event.manage") || event.status === "cancelled"}
        ticketTypes={detail.ticketTypes.map((type) => ({
          id: type.id,
          sold: type.qtySold,
          priceLabel:
            type.priceAmount === 0
              ? t("free")
              : formatMoney(type.priceAmount, event.currency, locale),
          values: {
            name: type.name,
            description: type.description ?? "",
            price: toMoneyInput(type.priceAmount, event.currency),
            capacity: String(type.capacity ?? ""),
            salesStartAt: local(type.salesStartAt),
            salesEndAt: local(type.salesEndAt),
            maxPerOrder: type.maxPerOrder ? String(type.maxPerOrder) : "",
          },
        }))}
      />
    </>
  );
}
