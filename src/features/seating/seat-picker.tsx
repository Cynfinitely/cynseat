"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlProps, Field, Select } from "@/components/ui/field";
import { formatMoney } from "@/domain/money/money";
import { SEAT_RADIUS, seatsOf, type Layout } from "@/domain/seatmap/layout";
import { setCartAction } from "@/features/checkout/actions";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { SeatMapView } from "./seat-map-view";

type Section = {
  id: string;
  name: string;
  ticketTypes: { id: string; name: string; priceAmount: number }[];
};
type SeatInfo = {
  id: string;
  key: string;
  sectionId: string;
  rowLabel: string;
  seatLabel: string;
  accessible: boolean;
  available: boolean;
};

type Props = {
  eventId: string;
  currency: string;
  maxPerOrder: number;
  layout: Layout;
  sections: Section[];
  seats: SeatInfo[];
  /** Seats already in this buyer's cart, with the ticket type chosen for each. */
  initialSelection: Record<string, string>;
};

const POLL_MS = 5000;

export function SeatPicker({
  eventId,
  currency,
  maxPerOrder,
  layout,
  sections,
  seats,
  initialSelection,
}: Props) {
  const t = useTranslations("seating.picker");
  const locale = useLocale();
  const router = useRouter();
  const money = (amount: number) => formatMoney(amount, currency, locale);

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );
  const seatByKey = useMemo(() => new Map(seats.map((seat) => [seat.key, seat])), [seats]);
  const seatById = useMemo(() => new Map(seats.map((seat) => [seat.id, seat])), [seats]);
  const positions = useMemo(() => seatsOf(layout), [layout]);

  const [selection, setSelection] = useState<Record<string, string>>(initialSelection);
  // The buyer's own reserved seats count as free for them.
  const [mine, setMine] = useState(() => new Set(Object.keys(initialSelection)));
  const [taken, setTaken] = useState(
    () => new Set(seats.filter((seat) => !seat.available).map((seat) => seat.id)),
  );
  const unavailable = useMemo(
    () => new Set([...taken].filter((id) => !mine.has(id))),
    [taken, mine],
  );
  const [focusKey, setFocusKey] = useState(() => positions[0]?.key);
  const [zoom, setZoom] = useState(1);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [listSection, setListSection] = useState(sections[0]?.id ?? "");
  const [listSeat, setListSeat] = useState("");
  const circles = useRef(new Map<string, SVGCircleElement>());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/availability`);
      if (!response.ok) return;
      const body = (await response.json()) as { unavailable: string[] };
      setTaken(new Set(body.unavailable));
    } catch {
      // Offline for a moment: keep showing what we last knew.
    }
  }, [eventId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const chosen = Object.keys(selection);
  const describe = (seat: SeatInfo) =>
    t("seat", {
      section: sectionById.get(seat.sectionId)?.name ?? "",
      row: seat.rowLabel,
      seat: seat.seatLabel,
    });
  const typeOf = (seatId: string) => {
    const seat = seatById.get(seatId)!;
    return sectionById
      .get(seat.sectionId)
      ?.ticketTypes.find((type) => type.id === selection[seatId]);
  };
  const total = chosen.reduce((sum, seatId) => sum + (typeOf(seatId)?.priceAmount ?? 0), 0);

  function toggle(seat: SeatInfo) {
    setNotice(undefined);
    if (selection[seat.id]) {
      const { [seat.id]: _removed, ...rest } = selection;
      return setSelection(rest);
    }
    const types = sectionById.get(seat.sectionId)?.ticketTypes ?? [];
    if (unavailable.has(seat.id)) return;
    if (types.length === 0) return setNotice(t("unpricedSection"));
    if (chosen.length >= maxPerOrder) return setNotice(t("max", { max: maxPerOrder }));
    setSelection({ ...selection, [seat.id]: types[0]!.id });
  }

  /** Moves keyboard focus to the nearest seat in the direction of the arrow pressed. */
  function onSeatKeyDown(event: KeyboardEvent, key: string) {
    const here = positions.find((seat) => seat.key === key);
    const seat = seatByKey.get(key);
    if (!here || !seat) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      return toggle(seat);
    }
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    const [dx, dy] = direction as [number, number];
    let best: { key: string; score: number } | undefined;
    for (const other of positions) {
      const along = (other.x - here.x) * dx + (other.y - here.y) * dy;
      if (along <= 1) continue;
      const across = Math.abs((other.x - here.x) * dy) + Math.abs((other.y - here.y) * dx);
      // Prefer seats straight ahead; sideways distance counts double.
      const score = along + across * 2;
      if (!best || score < best.score) best = { key: other.key, score };
    }
    if (best) {
      setFocusKey(best.key);
      circles.current.get(best.key)?.focus();
    }
  }

  async function submit() {
    if (chosen.length === 0) return setNotice(t("none"));
    setPending(true);
    setNotice(undefined);
    const result = await setCartAction({
      eventId,
      lines: [],
      seats: chosen.map((seatId) => ({ seatId, ticketTypeId: selection[seatId]! })),
    });
    if (result.ok) return router.push(`/checkout/${eventId}`);

    setPending(false);
    if (result.reason === "seats_taken") {
      // Drop the seats someone else got, and show the map as it now is.
      const lost = new Set(Object.keys(result.fields));
      setSelection(Object.fromEntries(Object.entries(selection).filter(([id]) => !lost.has(id))));
      setMine(new Set([...mine].filter((id) => !lost.has(id))));
      setNotice(t("taken"));
      await refresh();
    } else {
      setNotice(result.reason === "too_many_tickets" ? t("max", { max: maxPerOrder }) : t("taken"));
    }
  }

  const listSeats = seats.filter(
    (seat) => seat.sectionId === listSection && !unavailable.has(seat.id) && !selection[seat.id],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ul className="flex flex-wrap gap-4 text-sm">
            {[
              ["legendAvailable", "fill-white stroke-brand-600"],
              ["legendChosen", "fill-brand-600 stroke-brand-700"],
              ["legendUnavailable", "fill-gray-300 stroke-gray-400"],
              ["legendAccessible", "fill-white stroke-blue-700 [stroke-width:3]"],
            ].map(([key, className]) => (
              <li key={key} className="flex items-center gap-2">
                <svg width="16" height="16" aria-hidden>
                  <circle cx="8" cy="8" r="6.5" className={className} />
                </svg>
                {t(key as "legendAvailable")}
              </li>
            ))}
          </ul>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label="−"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            >
              −
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="+"
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
            >
              +
            </Button>
          </div>
        </div>

        <div className="border-line bg-surface-muted max-h-[70vh] overflow-auto rounded-xl border">
          <SeatMapView
            layout={layout}
            label={t("map")}
            zoom={zoom}
            renderSeat={(position) => {
              const seat = seatByKey.get(position.key);
              if (!seat) return null;
              const isChosen = Boolean(selection[seat.id]);
              const isTaken = unavailable.has(seat.id) && !isChosen;
              const cheapest = sectionById.get(seat.sectionId)?.ticketTypes[0];
              const state = isChosen ? t("chosen") : isTaken ? t("unavailable") : t("available");
              return (
                <circle
                  key={seat.key}
                  ref={(element) => {
                    if (element) circles.current.set(seat.key, element);
                    else circles.current.delete(seat.key);
                  }}
                  cx={position.x}
                  cy={position.y}
                  r={SEAT_RADIUS}
                  role="button"
                  // One tab stop for the whole map; arrow keys move within it.
                  tabIndex={seat.key === focusKey ? 0 : -1}
                  aria-pressed={isChosen}
                  aria-disabled={isTaken || undefined}
                  aria-label={[
                    describe(seat),
                    cheapest ? money(cheapest.priceAmount) : null,
                    seat.accessible ? t("accessible") : null,
                    state,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  className={cn(
                    "focus-visible:[outline:3px_solid_black] focus-visible:[outline-offset:2px]",
                    isChosen
                      ? "fill-brand-600 stroke-brand-700"
                      : isTaken
                        ? "fill-gray-300 stroke-gray-400"
                        : "stroke-brand-600 cursor-pointer fill-white",
                    seat.accessible && !isChosen && !isTaken && "stroke-blue-700 [stroke-width:3]",
                  )}
                  onClick={() => {
                    setFocusKey(seat.key);
                    toggle(seat);
                  }}
                  onKeyDown={(event) => onSeatKeyDown(event, seat.key)}
                />
              );
            }}
          />
        </div>

        {/* The same choice without the map: for screen readers, small screens, or preference. */}
        <section aria-labelledby="list-title" className="max-w-xl space-y-3 pt-4">
          <h2 id="list-title" className="text-ink text-lg font-semibold">
            {t("listTitle")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field id="list-section" label={t("listSection")}>
              <Select
                {...controlProps("list-section", {})}
                value={listSection}
                onChange={(event) => {
                  setListSection(event.target.value);
                  setListSeat("");
                }}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                    {section.ticketTypes[0]
                      ? ` · ${money(section.ticketTypes[0].priceAmount)}`
                      : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="list-seat" label={t("listSeat")}>
              <Select
                {...controlProps("list-seat", {})}
                value={listSeat}
                onChange={(event) => setListSeat(event.target.value)}
              >
                <option value="">{listSeats.length === 0 ? t("listNone") : "—"}</option>
                {listSeats.map((seat) => (
                  <option key={seat.id} value={seat.id}>
                    {seat.rowLabel} · {seat.seatLabel}
                    {seat.accessible ? ` (${t("accessible")})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              disabled={!listSeat}
              onClick={() => {
                const seat = seatById.get(listSeat);
                if (seat) toggle(seat);
                setListSeat("");
              }}
            >
              {t("listAdd")}
            </Button>
          </div>
        </section>
      </div>

      <aside>
        <Card className="space-y-3 p-5 lg:sticky lg:top-20">
          <h2 className="text-ink text-lg font-semibold">{t("selected")}</h2>
          <div aria-live="polite">{notice ? <Alert tone="warning">{notice}</Alert> : null}</div>
          {chosen.length === 0 ? (
            <p className="text-muted text-sm">{t("none")}</p>
          ) : (
            <ul className="divide-line divide-y text-sm">
              {chosen.map((seatId) => {
                const seat = seatById.get(seatId)!;
                const types = sectionById.get(seat.sectionId)?.ticketTypes ?? [];
                const label = describe(seat);
                return (
                  <li key={seatId} className="space-y-1.5 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-ink font-medium">{label}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t("remove", { seat: label })}
                        onClick={() => toggle(seat)}
                      >
                        ✕
                      </Button>
                    </div>
                    {types.length > 1 ? (
                      <Select
                        aria-label={t("type", { seat: label })}
                        className="py-1.5"
                        value={selection[seatId]}
                        onChange={(event) =>
                          setSelection({ ...selection, [seatId]: event.target.value })
                        }
                      >
                        {types.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} · {money(type.priceAmount)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <p className="text-muted">
                        {types[0]?.name} · {money(types[0]?.priceAmount ?? 0)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-ink border-line flex justify-between border-t pt-3 font-semibold">
            <span>{t("total")}</span>
            <span>{money(total)}</span>
          </p>
          <Button className="w-full" disabled={pending} onClick={submit}>
            {t("continue")}
          </Button>
        </Card>
      </aside>
    </div>
  );
}
