import { describe, expect, it } from "vitest";
import {
  editorReducer,
  initialEditorState,
  nextSectionName,
  snap,
  type EditorAction,
  type EditorState,
} from "./editor";
import { countSeats, emptyLayout, layoutSchema, seatsOf, type SeatedSection } from "./layout";

const run = (actions: EditorAction[], from: EditorState = initialEditorState(emptyLayout)) =>
  actions.reduce(editorReducer, from);

const addA: EditorAction = { type: "addSeated", key: "aaaa", name: "Stalls" };
const addB: EditorAction = { type: "addSeated", key: "bbbb", name: "Balcony" };
const seated = (state: EditorState, key: string) =>
  state.layout.sections.find((section) => section.key === key) as SeatedSection;

describe("adding things", () => {
  it("adds a ready-to-use block of seats and selects it", () => {
    const state = run([addA]);
    expect(state.selected).toBe("aaaa");
    expect(countSeats(state.layout)).toBe(50);
    expect(layoutSchema.safeParse(state.layout).success).toBe(true);
  });

  it("places each new item clear of what is already there", () => {
    const state = run([
      addA,
      addB,
      { type: "addArea", key: "cccc", name: "Floor" },
      { type: "addDecor", key: "dddd", kind: "stage", text: "Stage" },
      { type: "addDecor", key: "eeee", kind: "label", text: "Exit" },
    ]);
    const [stalls, balcony] = [seated(state, "aaaa"), seated(state, "bbbb")];
    expect(balcony.y).toBeGreaterThan(stalls.y + stalls.rows * stalls.rowSpacing);
    const stage = state.layout.decor.find((decor) => decor.kind === "stage")!;
    expect(stage.y + stage.height).toBeLessThan(stalls.y);
    expect(layoutSchema.safeParse(state.layout).success).toBe(true);

    const positions = seatsOf(state.layout).map((seat) => `${seat.x},${seat.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

describe("editing", () => {
  it("regenerates seats from changed parameters", () => {
    const state = run([
      addA,
      { type: "updateSection", key: "aaaa", changes: { rows: 12, seatsPerRow: 20 } },
    ]);
    expect(countSeats(state.layout)).toBe(240);
  });

  it("snaps moves to the grid and ignores moves that go nowhere", () => {
    const placed = run([addA]);
    const moved = editorReducer(placed, { type: "move", key: "aaaa", x: 123.4, y: 86 });
    expect(seated(moved, "aaaa")).toMatchObject({ x: 120, y: 90 });
    expect(snap(-14)).toBe(-10);

    const again = editorReducer(moved, { type: "move", key: "aaaa", x: 121, y: 91 });
    expect(again).toBe(moved);
    expect(editorReducer(moved, { type: "move", key: "zzzz", x: 0, y: 0 })).toBe(moved);
  });

  it("moves decorations too", () => {
    const state = run([
      { type: "addDecor", key: "dddd", kind: "stage", text: "Stage" },
      { type: "move", key: "dddd", x: 50, y: 70 },
    ]);
    expect(state.layout.decor[0]).toMatchObject({ x: 50, y: 70 });
  });

  it("removes single seats for aisles and flags accessible ones", () => {
    const state = run([
      addA,
      { type: "toggleSeat", sectionKey: "aaaa", row: 0, seat: 4, flag: "removed" },
      { type: "toggleSeat", sectionKey: "aaaa", row: 0, seat: 5, flag: "removed" },
      { type: "toggleSeat", sectionKey: "aaaa", row: 1, seat: 0, flag: "accessible" },
    ]);
    expect(countSeats(state.layout)).toBe(48);
    expect(
      seatsOf(state.layout)
        .filter((seat) => seat.accessible)
        .map((seat) => seat.key),
    ).toEqual(["aaaa:1-0"]);

    const restored = editorReducer(state, {
      type: "toggleSeat",
      sectionKey: "aaaa",
      row: 0,
      seat: 4,
      flag: "removed",
    });
    expect(countSeats(restored.layout)).toBe(49);
  });

  it("drops the accessible flag from a seat that is removed, and will not flag a removed seat", () => {
    const flag: EditorAction = {
      type: "toggleSeat",
      sectionKey: "aaaa",
      row: 0,
      seat: 0,
      flag: "accessible",
    };
    const remove: EditorAction = {
      type: "toggleSeat",
      sectionKey: "aaaa",
      row: 0,
      seat: 0,
      flag: "removed",
    };
    const state = run([addA, flag, remove]);
    expect(seated(state, "aaaa")).toMatchObject({ removed: ["0-0"], accessible: [] });
    expect(editorReducer(state, flag)).toBe(state);
  });

  it("ignores seats outside the section's grid", () => {
    const state = run([addA]);
    const outside: EditorAction = {
      type: "toggleSeat",
      sectionKey: "aaaa",
      row: 99,
      seat: 0,
      flag: "removed",
    };
    expect(editorReducer(state, outside)).toBe(state);
  });

  it("deletes the selected item and clears the selection", () => {
    const state = run([
      addA,
      addB,
      { type: "select", key: "aaaa" },
      { type: "remove", key: "aaaa" },
    ]);
    expect(state.layout.sections.map((section) => section.key)).toEqual(["bbbb"]);
    expect(state.selected).toBeNull();
    expect(editorReducer(state, { type: "remove", key: "nope" })).toBe(state);
  });
});

describe("undo and redo", () => {
  it("steps back and forward through every change", () => {
    const state = run([addA, { type: "updateSection", key: "aaaa", changes: { rows: 8 } }, addB]);
    const back1 = editorReducer(state, { type: "undo" });
    expect(back1.layout.sections).toHaveLength(1);
    expect(back1.selected).toBeNull(); // the selected section no longer exists
    const back2 = editorReducer(back1, { type: "undo" });
    expect(seated(back2, "aaaa").rows).toBe(5);
    const forward = run([{ type: "redo" }, { type: "redo" }], back2);
    expect(forward.layout).toEqual(state.layout);
    expect(editorReducer(forward, { type: "redo" })).toBe(forward);
  });

  it("does nothing at the start of history, and forgets redo after a new change", () => {
    const start = initialEditorState(emptyLayout);
    expect(editorReducer(start, { type: "undo" })).toBe(start);

    const state = run([addA, { type: "undo" }, addB]);
    expect(state.future).toEqual([]);
    expect(state.layout.sections.map((section) => section.key)).toEqual(["bbbb"]);
  });

  it("does not record selection changes or no-op edits", () => {
    const state = run([addA]);
    const selected = run(
      [
        { type: "select", key: null },
        { type: "select", key: "aaaa" },
      ],
      state,
    );
    expect(selected.past).toHaveLength(1);
    expect(editorReducer(state, { type: "updateSection", key: "nope", changes: { rows: 9 } })).toBe(
      state,
    );
  });

  it("keeps a bounded history", () => {
    const moves: EditorAction[] = Array.from({ length: 150 }, (_, index) => ({
      type: "move",
      key: "aaaa",
      x: index * 10,
      y: 0,
    }));
    expect(run([addA, ...moves]).past).toHaveLength(100);
  });
});

describe("nextSectionName", () => {
  it("skips names already in use, whatever their case", () => {
    const state = run([
      { type: "addSeated", key: "aaaa", name: "Section 2" },
      { type: "addSeated", key: "bbbb", name: "section 3" },
    ]);
    expect(nextSectionName(state.layout, "Section")).toBe("Section 4");
    expect(nextSectionName(emptyLayout, "Section")).toBe("Section 1");
  });
});
