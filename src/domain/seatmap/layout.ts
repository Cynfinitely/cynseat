import { z } from "zod";

/** Largest map supported. Rendering and seat selection are designed and tested up to this. */
export const MAX_SEATS = 5000;
export const MAX_SECTIONS = 60;
export const SEAT_RADIUS = 9;

const key = z.string().regex(/^[a-z0-9]{4,16}$/);
const coordinate = z.number().finite().min(-20_000).max(20_000);
const name = z.string().trim().min(1, "required").max(40, "too_long");
/** Identifies a seat inside its section by position, e.g. "3-12" (row index, seat index). */
const seatRef = z.string().regex(/^\d{1,3}-\d{1,3}$/);

export const seatedSectionSchema = z.object({
  kind: z.literal("seated"),
  key,
  name,
  x: coordinate,
  y: coordinate,
  /** Degrees, clockwise. */
  rotation: z.number().finite().min(-180).max(180),
  rows: z.number().int().min(1).max(100),
  seatsPerRow: z.number().int().min(1).max(100),
  rowLabels: z.enum(["letters", "numbers"]),
  /** Which end of a row seat number 1 is at, seen from the stage side of the section. */
  seatNumbering: z.enum(["left", "right"]),
  seatSpacing: z.number().finite().min(16).max(80),
  rowSpacing: z.number().finite().min(16).max(120),
  /** How far the ends of each row bend away from the stage; 0 is straight. */
  curve: z.number().finite().min(0).max(200),
  /** Seats taken out to make aisles and gaps. */
  removed: z.array(seatRef).max(MAX_SEATS),
  /** Wheelchair spaces and their companion seats. */
  accessible: z.array(seatRef).max(MAX_SEATS),
});
export type SeatedSection = z.infer<typeof seatedSectionSchema>;

/** A standing or unreserved area: sold by number, not by seat. */
export const areaSectionSchema = z.object({
  kind: z.literal("area"),
  key,
  name,
  x: coordinate,
  y: coordinate,
  width: z.number().finite().min(40).max(4000),
  height: z.number().finite().min(40).max(4000),
  capacity: z.number().int().min(1).max(100_000),
});
export type AreaSection = z.infer<typeof areaSectionSchema>;

export const sectionSchema = z.discriminatedUnion("kind", [seatedSectionSchema, areaSectionSchema]);
export type Section = z.infer<typeof sectionSchema>;

/** Things drawn for orientation only: the stage, and free text such as "Exit". */
export const decorSchema = z.object({
  key,
  kind: z.enum(["stage", "label"]),
  text: z.string().trim().max(40),
  x: coordinate,
  y: coordinate,
  width: z.number().finite().min(20).max(4000),
  height: z.number().finite().min(20).max(2000),
});
export type Decor = z.infer<typeof decorSchema>;

export const layoutSchema = z
  .object({
    v: z.literal(1),
    sections: z.array(sectionSchema).max(MAX_SECTIONS),
    decor: z.array(decorSchema).max(40),
  })
  .superRefine((layout, ctx) => {
    const keys = [...layout.sections.map((s) => s.key), ...layout.decor.map((d) => d.key)];
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", message: "duplicate_key" });
    }
    const names = layout.sections.map((section) => section.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      // Buyers and door staff tell sections apart by name.
      ctx.addIssue({ code: "custom", message: "duplicate_section_name" });
    }
    if (countSeats(layout as Layout) > MAX_SEATS) {
      ctx.addIssue({ code: "custom", message: "too_many_seats" });
    }
  });
export type Layout = z.infer<typeof layoutSchema>;

export const emptyLayout: Layout = { v: 1, sections: [], decor: [] };

// ---- Seats -------------------------------------------------------------------------------

export type Seat = {
  /** Unique within the map and stable across edits: "<section key>:<row>-<seat>". */
  key: string;
  sectionKey: string;
  /** As printed on the ticket. */
  rowLabel: string;
  seatLabel: string;
  x: number;
  y: number;
  accessible: boolean;
};

/** A, B, … Z, AA, AB, … */
export function letterLabel(index: number): string {
  let label = "";
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    label = String.fromCharCode(65 + (n % 26)) + label;
  }
  return label;
}

export const seatRefOf = (row: number, seat: number): string => `${row}-${seat}`;

/**
 * The seats a section produces. A seat's key comes from its position in the grid, not
 * from its label, so renaming rows or renumbering seats never changes which seat is which.
 */
export function seatsOfSection(section: SeatedSection): Seat[] {
  const removed = new Set(section.removed);
  const accessible = new Set(section.accessible);
  const angle = (section.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const middle = (section.seatsPerRow - 1) / 2;
  const seats: Seat[] = [];

  for (let row = 0; row < section.rows; row += 1) {
    for (let index = 0; index < section.seatsPerRow; index += 1) {
      const ref = seatRefOf(row, index);
      if (removed.has(ref)) continue;
      // Local position: rows run away from the stage, and a curve bends the row ends back.
      const offset = middle === 0 ? 0 : (index - middle) / middle;
      const localX = (index - middle) * section.seatSpacing;
      const localY = row * section.rowSpacing + section.curve * offset * offset;
      const number = section.seatNumbering === "left" ? index + 1 : section.seatsPerRow - index;
      seats.push({
        key: `${section.key}:${ref}`,
        sectionKey: section.key,
        rowLabel: section.rowLabels === "letters" ? letterLabel(row) : String(row + 1),
        seatLabel: String(number),
        x: round(section.x + localX * cos - localY * sin),
        y: round(section.y + localX * sin + localY * cos),
        accessible: accessible.has(ref),
      });
    }
  }
  return seats;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function seatsOf(layout: Layout): Seat[] {
  return layout.sections.flatMap((section) =>
    section.kind === "seated" ? seatsOfSection(section) : [],
  );
}

/** Number of reservable seats, without building them. */
export function countSeats(layout: Layout): number {
  let total = 0;
  for (const section of layout.sections) {
    if (section.kind !== "seated") continue;
    const inGrid = new Set(
      section.removed.filter((ref) => {
        const [row, seat] = ref.split("-").map(Number) as [number, number];
        return row < section.rows && seat < section.seatsPerRow;
      }),
    );
    total += section.rows * section.seatsPerRow - inGrid.size;
  }
  return total;
}

/** Total people the map holds: seats plus the capacity of standing areas. */
export function capacityOf(layout: Layout): number {
  return (
    countSeats(layout) +
    layout.sections.reduce(
      (sum, section) => sum + (section.kind === "area" ? section.capacity : 0),
      0,
    )
  );
}

export type Bounds = { minX: number; minY: number; width: number; height: number };

/** The box that contains everything on the map, with a margin, for fitting it on screen. */
export function boundsOf(layout: Layout, margin = 40): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const seat of seatsOf(layout)) {
    xs.push(seat.x - SEAT_RADIUS, seat.x + SEAT_RADIUS);
    ys.push(seat.y - SEAT_RADIUS, seat.y + SEAT_RADIUS);
  }
  for (const box of [...layout.sections.filter((s) => s.kind === "area"), ...layout.decor]) {
    xs.push(box.x, box.x + box.width);
    ys.push(box.y, box.y + box.height);
  }
  if (xs.length === 0) return { minX: 0, minY: 0, width: 800, height: 600 };
  const minX = Math.min(...xs) - margin;
  const minY = Math.min(...ys) - margin;
  return {
    minX,
    minY,
    width: Math.max(...xs) + margin - minX,
    height: Math.max(...ys) + margin - minY,
  };
}
