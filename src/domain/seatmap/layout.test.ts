import { describe, expect, it } from "vitest";
import {
  boundsOf,
  capacityOf,
  countSeats,
  emptyLayout,
  layoutSchema,
  letterLabel,
  MAX_SEATS,
  seatsOf,
  seatsOfSection,
  type Layout,
  type SeatedSection,
} from "./layout";

const section = (overrides: Partial<SeatedSection> = {}): SeatedSection => ({
  kind: "seated",
  key: "stalls",
  name: "Stalls",
  x: 0,
  y: 0,
  rotation: 0,
  rows: 3,
  seatsPerRow: 4,
  rowLabels: "letters",
  seatNumbering: "left",
  seatSpacing: 30,
  rowSpacing: 40,
  curve: 0,
  removed: [],
  accessible: [],
  ...overrides,
});

const layoutOf = (...sections: Layout["sections"]): Layout => ({ v: 1, sections, decor: [] });

describe("letterLabel", () => {
  it("continues past Z", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letterLabel)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });
});

describe("seatsOfSection", () => {
  it("lays seats out in a grid centred on the section, rows running away from the stage", () => {
    const seats = seatsOfSection(section());
    expect(seats).toHaveLength(12);
    expect(seats[0]).toEqual({
      key: "stalls:0-0",
      sectionKey: "stalls",
      rowLabel: "A",
      seatLabel: "1",
      x: -45,
      y: 0,
      accessible: false,
    });
    expect(seats[11]).toMatchObject({
      key: "stalls:2-3",
      rowLabel: "C",
      seatLabel: "4",
      x: 45,
      y: 80,
    });
  });

  it("labels rows with numbers and counts seats from either end", () => {
    const seats = seatsOfSection(section({ rowLabels: "numbers", seatNumbering: "right" }));
    expect(seats.slice(0, 4).map((seat) => `${seat.rowLabel}/${seat.seatLabel}`)).toEqual([
      "1/4",
      "1/3",
      "1/2",
      "1/1",
    ]);
  });

  it("keeps a seat's identity when labels and numbering change", () => {
    const before = seatsOfSection(section());
    const after = seatsOfSection(
      section({ rowLabels: "numbers", seatNumbering: "right", name: "Parterre" }),
    );
    expect(after.map((seat) => seat.key)).toEqual(before.map((seat) => seat.key));
    expect(after.map((seat) => [seat.x, seat.y])).toEqual(before.map((seat) => [seat.x, seat.y]));
  });

  it("leaves out removed seats without renumbering the rest", () => {
    const seats = seatsOfSection(section({ removed: ["0-1", "0-2"], accessible: ["1-0"] }));
    expect(seats).toHaveLength(10);
    expect(seats.filter((seat) => seat.rowLabel === "A").map((seat) => seat.seatLabel)).toEqual([
      "1",
      "4",
    ]);
    expect(seats.find((seat) => seat.key === "stalls:1-0")?.accessible).toBe(true);
  });

  it("rotates around the section's origin", () => {
    const [first] = seatsOfSection(section({ rotation: 90, x: 100, y: 100 }));
    // (-45, 0) turned a quarter clockwise is (0, -45).
    expect(first).toMatchObject({ x: 100, y: 55 });
  });

  it("bends the ends of a curved row away from the stage and leaves the middle alone", () => {
    const row = seatsOfSection(section({ rows: 1, seatsPerRow: 5, curve: 20 }));
    expect(row.map((seat) => seat.y)).toEqual([20, 5, 0, 5, 20]);
    expect(seatsOfSection(section({ rows: 1, seatsPerRow: 1, curve: 20 }))[0]).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it("gives every seat a different position and key", () => {
    const seats = seatsOfSection(section({ rows: 30, seatsPerRow: 40, curve: 60, rotation: 17 }));
    expect(new Set(seats.map((seat) => seat.key)).size).toBe(1200);
    expect(new Set(seats.map((seat) => `${seat.x},${seat.y}`)).size).toBe(1200);
  });
});

describe("counting", () => {
  const layout: Layout = {
    v: 1,
    sections: [
      section({ removed: ["0-0", "9-9", "0-0"] }),
      section({ key: "balcony", name: "Balcony", rows: 2, seatsPerRow: 10 }),
      {
        kind: "area",
        key: "floor",
        name: "Floor",
        x: 0,
        y: 300,
        width: 200,
        height: 100,
        capacity: 150,
      },
    ],
    decor: [],
  };

  it("matches the seats actually generated, ignoring removals outside the grid and repeats", () => {
    expect(countSeats(layout)).toBe(11 + 20);
    expect(seatsOf(layout)).toHaveLength(31);
    expect(capacityOf(layout)).toBe(181);
    expect(countSeats(emptyLayout)).toBe(0);
  });
});

describe("layoutSchema", () => {
  it("accepts a sensible map", () => {
    expect(layoutSchema.safeParse(layoutOf(section())).success).toBe(true);
  });

  const problems = (layout: unknown) =>
    layoutSchema.safeParse(layout).error?.issues.map((issue) => issue.message) ?? [];

  it("rejects two sections with the same key or the same name", () => {
    expect(problems(layoutOf(section(), section({ name: "Other" })))).toContain("duplicate_key");
    expect(problems(layoutOf(section(), section({ key: "other", name: "STALLS" })))).toContain(
      "duplicate_section_name",
    );
  });

  it("rejects maps over the seat limit", () => {
    const big = (key: string) => section({ key, name: key, rows: 60, seatsPerRow: 60 });
    expect(problems(layoutOf(big("aaaa"), big("bbbb")))).toContain("too_many_seats");
    expect(MAX_SEATS).toBe(5000);
  });

  it("rejects out-of-range and malformed values", () => {
    expect(layoutSchema.safeParse(layoutOf(section({ rows: 0 }))).success).toBe(false);
    expect(layoutSchema.safeParse(layoutOf(section({ seatSpacing: 2 }))).success).toBe(false);
    expect(layoutSchema.safeParse(layoutOf(section({ removed: ["x"] }))).success).toBe(false);
    expect(layoutSchema.safeParse(layoutOf(section({ key: "Bad Key!" }))).success).toBe(false);
    expect(layoutSchema.safeParse(layoutOf(section({ x: Number.NaN }))).success).toBe(false);
    expect(layoutSchema.safeParse({ v: 2, sections: [], decor: [] }).success).toBe(false);
  });
});

describe("boundsOf", () => {
  it("contains every seat with a margin", () => {
    const bounds = boundsOf(layoutOf(section({ x: 500, y: 200 })), 10);
    expect(bounds).toEqual({ minX: 436, minY: 181, width: 128, height: 118 });
  });

  it("has a default size for an empty map", () => {
    expect(boundsOf(emptyLayout)).toEqual({ minX: 0, minY: 0, width: 800, height: 600 });
  });
});
