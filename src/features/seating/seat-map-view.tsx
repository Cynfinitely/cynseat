import type { ReactNode } from "react";
import { boundsOf, seatsOf, type Layout, type Seat } from "@/domain/seatmap/layout";

/**
 * Draws a seat map: stage and labels, standing areas, and every seat through `renderSeat`.
 * The caller decides what a seat looks like and whether it can be clicked.
 */
export function SeatMapView({
  layout,
  label,
  zoom = 1,
  renderSeat,
}: {
  layout: Layout;
  label: string;
  zoom?: number;
  renderSeat(seat: Seat): ReactNode;
}) {
  const bounds = boundsOf(layout);
  const sections = new Map(layout.sections.map((section) => [section.key, section.name]));
  // Each section's name sits above its highest seat, at its left edge.
  const firstSeat = new Map<string, { x: number; y: number }>();
  const seats = seatsOf(layout);
  for (const seat of seats) {
    const corner = firstSeat.get(seat.sectionKey);
    firstSeat.set(seat.sectionKey, {
      x: Math.min(corner?.x ?? seat.x, seat.x),
      y: Math.min(corner?.y ?? seat.y, seat.y),
    });
  }

  return (
    <svg
      role="group"
      aria-label={label}
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      // Fitted to the available width (important on phones), but never blown up far
      // beyond its natural size on a wide screen. Zooming scales both limits.
      style={{ width: `${zoom * 100}%`, maxWidth: bounds.width * zoom * 1.25, height: "auto" }}
      className="block"
    >
      {layout.decor.map((item) => (
        <g key={item.key} aria-hidden>
          <rect
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            rx={6}
            className={item.kind === "stage" ? "fill-gray-700" : "fill-transparent"}
          />
          <text
            x={item.x + item.width / 2}
            y={item.y + item.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className={
              item.kind === "stage" ? "fill-white text-sm font-semibold" : "fill-gray-600 text-sm"
            }
          >
            {item.text}
          </text>
        </g>
      ))}
      {layout.sections.map((section) =>
        section.kind === "area" ? (
          <g key={section.key} aria-hidden>
            <rect
              x={section.x}
              y={section.y}
              width={section.width}
              height={section.height}
              rx={8}
              className="fill-brand-50 stroke-brand-500 [stroke-dasharray:6_4]"
            />
            <text
              x={section.x + section.width / 2}
              y={section.y + section.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-brand-700 text-sm font-semibold"
            >
              {section.name}
            </text>
          </g>
        ) : null,
      )}
      {[...firstSeat].map(([key, seat]) => (
        <text
          key={key}
          x={seat.x - 9}
          y={seat.y - 17}
          aria-hidden
          className="fill-gray-600 text-xs font-semibold"
        >
          {sections.get(key)}
        </text>
      ))}
      {seats.map(renderSeat)}
    </svg>
  );
}
