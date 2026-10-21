"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatMoney, toMoneyInput } from "@/domain/money/money";
import { SEAT_RADIUS, type Layout } from "@/domain/seatmap/layout";
import { useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/lib/use-error-text";
import { cn } from "@/lib/utils";
import type { EventSeating } from "@/server/modules/seatmaps/service";
import { detachSeatMapAction, saveSeatedTicketTypeAction, setSeatsBlockedAction } from "./actions";
import { SeatMapView } from "./seat-map-view";

type Props = {
  orgSlug: string;
  eventId: string;
  currency: string;
  seating: EventSeating;
  /** Whether the event's structure can still change (draft, nothing sold). */
  editable: boolean;
  canManage: boolean;
};

const statusClass = {
  available: "fill-green-600 stroke-green-800",
  blocked: "fill-gray-300 stroke-gray-500",
  sold: "fill-brand-700 stroke-brand-700",
  held: "fill-amber-500 stroke-amber-700",
} as const;

export function EventSeatingManager({
  orgSlug,
  eventId,
  currency,
  seating,
  editable,
  canManage,
}: Props) {
  const t = useTranslations("seating.event");
  const tSeat = useTranslations("seating.editor");
  const errorText = useErrorText();
  const locale = useLocale();
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string }>();
  const [pending, setPending] = useState(false);
  const seatByKey = new Map(seating.seats.map((seat) => [seat.key, seat]));
  const sectionName = new Map(seating.sections.map((section) => [section.id, section.name]));

  // Seated ticket types, gathered from the sections they price.
  const types = new Map<
    string,
    { id: string; name: string; priceAmount: number; sectionIds: string[] }
  >();
  for (const section of seating.sections) {
    for (const type of section.ticketTypes) {
      const entry = types.get(type.id) ?? { ...type, sectionIds: [] };
      entry.sectionIds.push(section.id);
      types.set(type.id, entry);
    }
  }

  async function run<T>(
    action: () => Promise<
      { ok: true; data: T } | { ok: false; reason: string; fields: Record<string, string> }
    >,
    done: (data: T) => string,
  ) {
    setPending(true);
    setMessage(undefined);
    const result = await action();
    setPending(false);
    if (result.ok) setMessage({ tone: "success", text: done(result.data) });
    else {
      const field = Object.values(result.fields)[0];
      setMessage({ tone: "danger", text: errorText(field ?? result.reason) ?? "" });
    }
    router.refresh();
    return result.ok;
  }

  async function toggleBlocked(seatKey: string) {
    const seat = seatByKey.get(seatKey);
    if (!seat || !canManage || (seat.status !== "available" && seat.status !== "blocked")) return;
    await run(
      () =>
        setSeatsBlockedAction(orgSlug, eventId, {
          seatIds: [seat.id],
          blocked: seat.status === "available",
        }),
      (count) => t("blocked", { count }),
    );
  }

  return (
    <div className="space-y-10">
      <div aria-live="polite">
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p>{t("attached", { count: seating.seats.length })}</p>
        {editable && canManage ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("detachConfirm"))) return;
              void run(
                () => detachSeatMapAction(orgSlug, eventId),
                () => "",
              );
            }}
          >
            {t("detach")}
          </Button>
        ) : (
          <p className="text-muted text-sm">{t("locked")}</p>
        )}
      </Card>

      <section aria-labelledby="prices-title">
        <h2 id="prices-title" className="text-ink text-lg font-semibold">
          {t("pricesTitle")}
        </h2>
        <p className="text-muted mt-1 text-sm">{t("pricesIntro")}</p>
        {types.size === 0 ? <p className="mt-3 text-sm font-medium">{t("noTypes")}</p> : null}
        <ul className="mt-3 space-y-3">
          {[...types.values()].map((type) => (
            <li key={type.id}>
              <Card className="p-5">
                <SeatedTypeForm
                  key={`${type.id}-${type.priceAmount}-${type.sectionIds.join()}`}
                  currency={currency}
                  sections={seating.sections}
                  disabled={!canManage || pending}
                  initial={{
                    id: type.id,
                    name: type.name,
                    price: toMoneyInput(type.priceAmount, currency),
                    sectionIds: type.sectionIds,
                  }}
                  summary={formatMoney(type.priceAmount, currency, locale)}
                  onSave={(values) =>
                    run(
                      () => saveSeatedTicketTypeAction(orgSlug, eventId, values),
                      () => t("saveType"),
                    )
                  }
                />
              </Card>
            </li>
          ))}
        </ul>
        {canManage ? (
          <Card className="mt-3 p-5">
            <SeatedTypeForm
              key={types.size}
              currency={currency}
              sections={seating.sections}
              disabled={pending}
              initial={{ id: null, name: "", price: "", sectionIds: [] }}
              onSave={(values) =>
                run(
                  () => saveSeatedTicketTypeAction(orgSlug, eventId, values),
                  () => t("saveType"),
                )
              }
            />
          </Card>
        ) : null}
      </section>

      <section aria-labelledby="block-title">
        <h2 id="block-title" className="text-ink text-lg font-semibold">
          {t("blockTitle")}
        </h2>
        <p className="text-muted mt-1 text-sm">{t("blockIntro")}</p>
        <ul className="mt-3 flex flex-wrap gap-4 text-sm">
          {(["available", "blocked", "held", "sold"] as const).map((status) => (
            <li key={status} className="flex items-center gap-2">
              <svg width="16" height="16" aria-hidden>
                <circle cx="8" cy="8" r="7" className={statusClass[status]} />
              </svg>
              {t(`legend${status[0]!.toUpperCase()}${status.slice(1)}` as "legendAvailable")}
            </li>
          ))}
        </ul>
        <div className="border-line bg-surface-muted mt-3 max-h-[70vh] overflow-auto rounded-xl border">
          <SeatMapView
            layout={seating.layout as Layout}
            label={t("blockTitle")}
            renderSeat={(seat) => {
              const row = seatByKey.get(seat.key);
              if (!row) return null;
              const changeable =
                canManage && (row.status === "available" || row.status === "blocked");
              const label = `${tSeat("seat", {
                section: sectionName.get(row.sectionId) ?? "",
                row: row.rowLabel,
                seat: row.seatLabel,
              })}, ${t(`legend${row.status[0]!.toUpperCase()}${row.status.slice(1)}` as "legendAvailable")}`;
              return (
                <circle
                  key={seat.key}
                  cx={seat.x}
                  cy={seat.y}
                  r={SEAT_RADIUS}
                  role={changeable ? "button" : "img"}
                  tabIndex={changeable ? 0 : undefined}
                  aria-label={label}
                  aria-pressed={changeable ? row.status === "blocked" : undefined}
                  className={cn(statusClass[row.status], changeable && "cursor-pointer")}
                  onClick={() => void toggleBlocked(seat.key)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    void toggleBlocked(seat.key);
                  }}
                />
              );
            }}
          />
        </div>
      </section>
    </div>
  );
}

type TypeValues = { id: string | null; name: string; price: string; sectionIds: string[] };

function SeatedTypeForm({
  currency,
  sections,
  initial,
  summary,
  disabled,
  onSave,
}: {
  currency: string;
  sections: EventSeating["sections"];
  initial: TypeValues;
  summary?: string;
  disabled: boolean;
  onSave(values: TypeValues): Promise<boolean>;
}) {
  const t = useTranslations("seating.event");
  const [values, setValues] = useState(initial);
  const prefix = `seated-${initial.id ?? "new"}`;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(values);
      }}
    >
      <fieldset disabled={disabled} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${prefix}-name`} label={t("typeName")}>
            <Input
              {...controlProps(`${prefix}-name`, {})}
              required
              maxLength={80}
              value={values.name}
              onChange={(event) => setValues({ ...values, name: event.target.value })}
            />
          </Field>
          <Field
            id={`${prefix}-price`}
            label={t("typePrice", { currency: currency.toUpperCase() })}
            hint={summary}
          >
            <Input
              {...controlProps(`${prefix}-price`, { hint: summary })}
              required
              inputMode="decimal"
              value={values.price}
              onChange={(event) => setValues({ ...values, price: event.target.value })}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="text-ink text-sm font-medium">{t("sections")}</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
            {sections.map((section) => (
              <label key={section.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand-600 size-4"
                  checked={values.sectionIds.includes(section.id)}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      sectionIds: event.target.checked
                        ? [...values.sectionIds, section.id]
                        : values.sectionIds.filter((id) => id !== section.id),
                    })
                  }
                />
                {section.name}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" size="sm" variant={initial.id ? "secondary" : "primary"}>
          {initial.id ? t("saveType") : t("addType")}
        </Button>
      </fieldset>
    </form>
  );
}
