"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  editorReducer,
  initialEditorState,
  nextSectionName,
  type EditorAction,
  type SeatFlag,
} from "@/domain/seatmap/editor";
import {
  boundsOf,
  countSeats,
  MAX_SEATS,
  SEAT_RADIUS,
  seatRefOf,
  seatsOfSection,
  type Layout,
  type SeatedSection,
} from "@/domain/seatmap/layout";
import { useErrorText } from "@/lib/use-error-text";
import { cn } from "@/lib/utils";
import { saveSeatMapAction } from "./actions";

type Mode = "select" | SeatFlag;
type Drag = { key: string; startX: number; startY: number; dx: number; dy: number };

const newKey = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

/** Every grid position of a section, including seats that have been removed. */
function gridOf(section: SeatedSection) {
  const all = seatsOfSection({ ...section, removed: [], accessible: [] });
  const removed = new Set(section.removed);
  const accessible = new Set(section.accessible);
  return all.map((seat, index) => {
    const row = Math.floor(index / section.seatsPerRow);
    const column = index % section.seatsPerRow;
    const ref = seatRefOf(row, column);
    return { ...seat, row, column, removed: removed.has(ref), accessible: accessible.has(ref) };
  });
}

export function SeatMapEditor({
  orgSlug,
  seatMapId,
  initialName,
  initialLayout,
}: {
  orgSlug: string;
  seatMapId: string;
  initialName: string;
  initialLayout: Layout;
}) {
  const t = useTranslations("seating.editor");
  const errorText = useErrorText();
  const [state, dispatch] = useReducer(editorReducer, initialLayout, initialEditorState);
  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<Mode>("select");
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag>();
  const [saved, setSaved] = useState({ layout: initialLayout, name: initialName });
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string }>();
  const [saving, setSaving] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  const { layout, selected } = state;
  const dirty = layout !== saved.layout || name !== saved.name;
  const seatCount = useMemo(() => countSeats(layout), [layout]);
  // The view only grows while editing, so the drawing does not jump under the pointer.
  const bounds = useMemo(() => boundsOf(layout, 120), [layout]);
  const section = layout.sections.find((item) => item.key === selected);
  const decor = layout.decor.find((item) => item.key === selected);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const act = (action: EditorAction) => {
    setStatus(undefined);
    dispatch(action);
  };

  /** Pointer position in the drawing's own coordinates. */
  function toMap(event: PointerEvent): { x: number; y: number } {
    const matrix = svg.current?.getScreenCTM()?.inverse();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }

  function startDrag(key: string, event: PointerEvent) {
    if (mode !== "select") return;
    const point = toMap(event);
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    act({ type: "select", key });
    setDrag({ key, startX: point.x, startY: point.y, dx: 0, dy: 0 });
  }

  function moveDrag(event: PointerEvent) {
    if (!drag) return;
    const point = toMap(event);
    setDrag({ ...drag, dx: point.x - drag.startX, dy: point.y - drag.startY });
  }

  function endDrag() {
    if (!drag) return;
    const item =
      layout.sections.find((candidate) => candidate.key === drag.key) ??
      layout.decor.find((candidate) => candidate.key === drag.key);
    if (item && (drag.dx !== 0 || drag.dy !== 0)) {
      act({ type: "move", key: drag.key, x: item.x + drag.dx, y: item.y + drag.dy });
    }
    setDrag(undefined);
  }

  const dragProps = (key: string) => ({
    onPointerDown: (event: PointerEvent) => startDrag(key, event),
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    transform: drag?.key === key ? `translate(${drag.dx} ${drag.dy})` : undefined,
  });

  async function save() {
    setSaving(true);
    const result = await saveSeatMapAction(orgSlug, seatMapId, { name, layout });
    setSaving(false);
    if (result.ok) {
      setSaved({ layout, name });
      setStatus({ tone: "success", text: t("saved") });
    } else {
      setStatus({ tone: "danger", text: errorText(result.fields.name ?? result.reason) ?? "" });
    }
  }

  const numberField = (
    id: string,
    label: string,
    value: number,
    onChange: (value: number) => void,
    limits: { min: number; max: number; step?: number },
  ) => (
    <Field id={id} label={label}>
      <Input
        {...controlProps(id, {})}
        type="number"
        inputMode="numeric"
        {...limits}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          // Out-of-range values would only be refused on save; hold them back here.
          if (event.target.value !== "" && next >= limits.min && next <= limits.max) onChange(next);
        }}
      />
    </Field>
  );
  const updateSection = (changes: Partial<SeatedSection>) =>
    act({ type: "updateSection", key: selected!, changes });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field id="map-name" label={t("name")} className="min-w-56 flex-1">
          <Input
            {...controlProps("map-name", {})}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <p
          className={cn(
            "pb-3 text-sm",
            seatCount > MAX_SEATS ? "text-danger font-semibold" : "text-muted",
          )}
        >
          {t("seatCount", { count: seatCount, max: MAX_SEATS })}
        </p>
        <Button onClick={save} disabled={saving || !dirty || seatCount > MAX_SEATS}>
          {t("save")}
        </Button>
      </div>
      <div aria-live="polite">
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        {!status && dirty ? <p className="text-muted text-sm">{t("unsaved")}</p> : null}
      </div>

      <div role="toolbar" aria-label={t("tools")} className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            act({ type: "addSeated", key: newKey(), name: nextSectionName(layout, t("section")) })
          }
        >
          {t("addSeated")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            act({ type: "addArea", key: newKey(), name: nextSectionName(layout, t("area")) })
          }
        >
          {t("addArea")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => act({ type: "addDecor", key: newKey(), kind: "stage", text: t("stage") })}
        >
          {t("addStage")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => act({ type: "addDecor", key: newKey(), kind: "label", text: t("label") })}
        >
          {t("addLabel")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={state.past.length === 0}
          onClick={() => act({ type: "undo" })}
        >
          {t("undo")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={state.future.length === 0}
          onClick={() => act({ type: "redo" })}
        >
          {t("redo")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!selected}
          onClick={() => selected && act({ type: "remove", key: selected })}
        >
          {t("delete")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t("zoomOut")}
          onClick={() => setZoom(Math.max(0.4, zoom - 0.2))}
        >
          −
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t("zoomIn")}
          onClick={() => setZoom(Math.min(3, zoom + 0.2))}
        >
          +
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="border-line bg-surface-muted max-h-[70vh] overflow-auto rounded-xl border">
          <svg
            ref={svg}
            role="group"
            aria-label={t("canvas")}
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
            width={bounds.width * zoom}
            height={bounds.height * zoom}
            className="touch-none select-none"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) act({ type: "select", key: null });
            }}
          >
            {layout.decor.map((item) => (
              <g key={item.key} {...dragProps(item.key)} className="cursor-move">
                <rect
                  x={item.x}
                  y={item.y}
                  width={item.width}
                  height={item.height}
                  rx={6}
                  className={cn(
                    item.kind === "stage" ? "fill-gray-700" : "fill-transparent",
                    selected === item.key ? "stroke-brand-600 stroke-[3]" : "stroke-gray-400",
                  )}
                />
                <text
                  x={item.x + item.width / 2}
                  y={item.y + item.height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    "text-sm font-semibold",
                    item.kind === "stage" ? "fill-white" : "fill-gray-700",
                  )}
                >
                  {item.text}
                </text>
              </g>
            ))}

            {layout.sections.map((item) => {
              const isSelected = selected === item.key;
              if (item.kind === "area") {
                return (
                  <g key={item.key} {...dragProps(item.key)} className="cursor-move">
                    <rect
                      x={item.x}
                      y={item.y}
                      width={item.width}
                      height={item.height}
                      rx={8}
                      className={cn(
                        "fill-brand-50",
                        isSelected
                          ? "stroke-brand-600 stroke-[3]"
                          : "stroke-brand-500 [stroke-dasharray:6_4]",
                      )}
                    />
                    <text
                      x={item.x + item.width / 2}
                      y={item.y + item.height / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-brand-700 text-sm font-semibold"
                    >
                      {item.name} ({item.capacity})
                    </text>
                  </g>
                );
              }
              const grid = gridOf(item);
              // The name sits above the section's highest seat, clear of curved rows.
              const first = grid[0] && {
                x: Math.min(...grid.map((seat) => seat.x)),
                y: Math.min(...grid.map((seat) => seat.y)),
              };
              return (
                <g
                  key={item.key}
                  {...dragProps(item.key)}
                  className={mode === "select" ? "cursor-move" : undefined}
                >
                  {first ? (
                    <text
                      x={first.x - SEAT_RADIUS}
                      y={first.y - SEAT_RADIUS - 8}
                      className={cn(
                        "text-xs font-semibold",
                        isSelected ? "fill-brand-700" : "fill-gray-600",
                      )}
                    >
                      {item.name}
                    </text>
                  ) : null}
                  {grid.map((seat) => {
                    const label = `${t("seat", { section: item.name, row: seat.rowLabel, seat: seat.seatLabel })}${
                      seat.removed
                        ? `, ${t("removedSeat")}`
                        : seat.accessible
                          ? `, ${t("accessibleSeat")}`
                          : ""
                    }`;
                    const editable = mode !== "select" && isSelected;
                    return (
                      <circle
                        key={seat.key}
                        cx={seat.x}
                        cy={seat.y}
                        r={SEAT_RADIUS}
                        role={editable ? "button" : undefined}
                        tabIndex={editable ? 0 : undefined}
                        aria-label={editable ? label : undefined}
                        aria-pressed={
                          editable
                            ? mode === "removed"
                              ? seat.removed
                              : seat.accessible
                            : undefined
                        }
                        className={cn(
                          seat.removed
                            ? "fill-transparent stroke-gray-300 [stroke-dasharray:3_3]"
                            : seat.accessible
                              ? "fill-blue-600 stroke-blue-800"
                              : isSelected
                                ? "fill-brand-600 stroke-brand-700"
                                : "fill-gray-400 stroke-gray-500",
                          mode !== "select" && "cursor-pointer",
                        )}
                        onClick={() => {
                          if (mode === "select") return;
                          act({ type: "select", key: item.key });
                          act({
                            type: "toggleSeat",
                            sectionKey: item.key,
                            row: seat.row,
                            seat: seat.column,
                            flag: mode,
                          });
                        }}
                        onKeyDown={(event) => {
                          if (!editable || (event.key !== "Enter" && event.key !== " ")) return;
                          event.preventDefault();
                          act({
                            type: "toggleSeat",
                            sectionKey: item.key,
                            row: seat.row,
                            seat: seat.column,
                            flag: mode,
                          });
                        }}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="space-y-4">
          <Field id="mode" label={t("mode")}>
            <Select
              {...controlProps("mode", {})}
              value={mode}
              onChange={(event) => setMode(event.target.value as Mode)}
            >
              <option value="select">{t("modeSelect")}</option>
              <option value="removed">{t("modeRemove")}</option>
              <option value="accessible">{t("modeAccessible")}</option>
            </Select>
          </Field>

          <section aria-labelledby="inspector-title" className="space-y-3">
            <h2 id="inspector-title" className="text-ink font-semibold">
              {t("inspector")}
            </h2>
            {!section && !decor ? (
              <p className="text-muted text-sm">{t("nothingSelected")}</p>
            ) : null}

            {section ? (
              <>
                <Field id="section-name" label={t("sectionName")}>
                  <Input
                    {...controlProps("section-name", {})}
                    value={section.name}
                    maxLength={40}
                    onChange={(event) =>
                      act({
                        type: "updateSection",
                        key: section.key,
                        changes: { name: event.target.value },
                      })
                    }
                  />
                </Field>
                {section.kind === "seated" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {numberField(
                        "rows",
                        t("rows"),
                        section.rows,
                        (rows) => updateSection({ rows }),
                        { min: 1, max: 100 },
                      )}
                      {numberField(
                        "seats-per-row",
                        t("seatsPerRow"),
                        section.seatsPerRow,
                        (seatsPerRow) => updateSection({ seatsPerRow }),
                        { min: 1, max: 100 },
                      )}
                    </div>
                    <Field id="row-labels" label={t("rowLabels")}>
                      <Select
                        {...controlProps("row-labels", {})}
                        value={section.rowLabels}
                        onChange={(event) =>
                          updateSection({
                            rowLabels: event.target.value as SeatedSection["rowLabels"],
                          })
                        }
                      >
                        <option value="letters">{t("letters")}</option>
                        <option value="numbers">{t("numbers")}</option>
                      </Select>
                    </Field>
                    <Field id="seat-numbering" label={t("seatNumbering")}>
                      <Select
                        {...controlProps("seat-numbering", {})}
                        value={section.seatNumbering}
                        onChange={(event) =>
                          updateSection({
                            seatNumbering: event.target.value as SeatedSection["seatNumbering"],
                          })
                        }
                      >
                        <option value="left">{t("left")}</option>
                        <option value="right">{t("right")}</option>
                      </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      {numberField(
                        "seat-spacing",
                        t("seatSpacing"),
                        section.seatSpacing,
                        (seatSpacing) => updateSection({ seatSpacing }),
                        { min: 16, max: 80 },
                      )}
                      {numberField(
                        "row-spacing",
                        t("rowSpacing"),
                        section.rowSpacing,
                        (rowSpacing) => updateSection({ rowSpacing }),
                        { min: 16, max: 120 },
                      )}
                      {numberField(
                        "curve",
                        t("curve"),
                        section.curve,
                        (curve) => updateSection({ curve }),
                        { min: 0, max: 200, step: 5 },
                      )}
                      {numberField(
                        "rotation",
                        t("rotation"),
                        section.rotation,
                        (rotation) => updateSection({ rotation }),
                        { min: -180, max: 180, step: 5 },
                      )}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {numberField(
                      "capacity",
                      t("capacity"),
                      section.capacity,
                      (capacity) =>
                        act({ type: "updateSection", key: section.key, changes: { capacity } }),
                      { min: 1, max: 100000 },
                    )}
                    {numberField(
                      "width",
                      t("width"),
                      section.width,
                      (width) =>
                        act({ type: "updateSection", key: section.key, changes: { width } }),
                      { min: 40, max: 4000, step: 10 },
                    )}
                    {numberField(
                      "height",
                      t("height"),
                      section.height,
                      (height) =>
                        act({ type: "updateSection", key: section.key, changes: { height } }),
                      { min: 40, max: 4000, step: 10 },
                    )}
                  </div>
                )}
              </>
            ) : null}

            {decor ? (
              <>
                <Field id="decor-text" label={t("text")}>
                  <Input
                    {...controlProps("decor-text", {})}
                    value={decor.text}
                    maxLength={40}
                    onChange={(event) =>
                      act({
                        type: "updateDecor",
                        key: decor.key,
                        changes: { text: event.target.value },
                      })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  {numberField(
                    "width",
                    t("width"),
                    decor.width,
                    (width) => act({ type: "updateDecor", key: decor.key, changes: { width } }),
                    { min: 20, max: 4000, step: 10 },
                  )}
                  {numberField(
                    "height",
                    t("height"),
                    decor.height,
                    (height) => act({ type: "updateDecor", key: decor.key, changes: { height } }),
                    { min: 20, max: 2000, step: 10 },
                  )}
                </div>
              </>
            ) : null}

            {section || decor ? (
              <>
                {/* Moving without a pointer: positions can be typed. */}
                <div className="grid grid-cols-2 gap-3">
                  {numberField(
                    "pos-x",
                    t("x"),
                    (section ?? decor)!.x,
                    (x) => act({ type: "move", key: selected!, x, y: (section ?? decor)!.y }),
                    { min: -20000, max: 20000, step: 10 },
                  )}
                  {numberField(
                    "pos-y",
                    t("y"),
                    (section ?? decor)!.y,
                    (y) => act({ type: "move", key: selected!, x: (section ?? decor)!.x, y }),
                    { min: -20000, max: 20000, step: 10 },
                  )}
                </div>
                <p className="text-muted text-xs">{t("moveHint")}</p>
              </>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
