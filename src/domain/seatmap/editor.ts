import {
  boundsOf,
  seatRefOf,
  type AreaSection,
  type Decor,
  type Layout,
  type SeatedSection,
  type Section,
} from "./layout";

/** Everything the seat-map editor knows. Changes go through `editorReducer` only. */
export type EditorState = {
  layout: Layout;
  /** Key of the selected section or decoration. */
  selected: string | null;
  /** Earlier layouts, most recent last, for undo. */
  past: Layout[];
  future: Layout[];
};

export type SeatFlag = "removed" | "accessible";

export type EditorAction =
  /** `key` is chosen by the caller so that the reducer stays free of randomness. */
  | { type: "addSeated"; key: string; name: string }
  | { type: "addArea"; key: string; name: string }
  | { type: "addDecor"; key: string; kind: Decor["kind"]; text: string }
  | { type: "updateSection"; key: string; changes: Partial<SeatedSection> | Partial<AreaSection> }
  | { type: "updateDecor"; key: string; changes: Partial<Decor> }
  | { type: "move"; key: string; x: number; y: number }
  | { type: "remove"; key: string }
  | { type: "toggleSeat"; sectionKey: string; row: number; seat: number; flag: SeatFlag }
  | { type: "select"; key: string | null }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 100;
const GRID = 10;

export const snap = (value: number): number => Math.round(value / GRID) * GRID;

export function initialEditorState(layout: Layout): EditorState {
  return { layout, selected: null, past: [], future: [] };
}

/** Where a new item goes: under everything already on the map, so nothing overlaps. */
function freeSpot(layout: Layout): { x: number; y: number } {
  if (layout.sections.length === 0 && layout.decor.length === 0) return { x: 400, y: 200 };
  const bounds = boundsOf(layout, 0);
  return { x: snap(bounds.minX + bounds.width / 2), y: snap(bounds.minY + bounds.height + 60) };
}

function commit(state: EditorState, layout: Layout, selected = state.selected): EditorState {
  // Nothing changed: hand back the very same state, so callers can tell.
  if (layout === state.layout) return selected === state.selected ? state : { ...state, selected };
  return {
    layout,
    selected,
    past: [...state.past, state.layout].slice(-HISTORY_LIMIT),
    future: [],
  };
}

const mapSections = (
  layout: Layout,
  key: string,
  change: (section: Section) => Section,
): Layout => {
  let changed = false;
  const sections = layout.sections.map((section) => {
    if (section.key !== key) return section;
    const next = change(section);
    changed ||= next !== section;
    return next;
  });
  return changed ? { ...layout, sections } : layout;
};

function toggled(list: string[], ref: string): string[] {
  return list.includes(ref) ? list.filter((item) => item !== ref) : [...list, ref];
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { layout } = state;

  switch (action.type) {
    case "addSeated": {
      const spot = freeSpot(layout);
      const section: SeatedSection = {
        kind: "seated",
        key: action.key,
        name: action.name,
        ...spot,
        rotation: 0,
        rows: 5,
        seatsPerRow: 10,
        rowLabels: "letters",
        seatNumbering: "left",
        seatSpacing: 26,
        rowSpacing: 30,
        curve: 0,
        removed: [],
        accessible: [],
      };
      return commit(state, { ...layout, sections: [...layout.sections, section] }, action.key);
    }
    case "addArea": {
      const spot = freeSpot(layout);
      const area: AreaSection = {
        kind: "area",
        key: action.key,
        name: action.name,
        x: spot.x - 120,
        y: spot.y,
        width: 240,
        height: 120,
        capacity: 100,
      };
      return commit(state, { ...layout, sections: [...layout.sections, area] }, action.key);
    }
    case "addDecor": {
      const isStage = action.kind === "stage";
      // The stage belongs above the seating; labels go wherever there is room.
      const bounds = boundsOf(layout, 0);
      const empty = layout.sections.length === 0 && layout.decor.length === 0;
      const width = isStage ? 320 : 120;
      const height = isStage ? 60 : 30;
      const centre = empty ? 400 : bounds.minX + bounds.width / 2;
      const decor: Decor = {
        key: action.key,
        kind: action.kind,
        text: action.text,
        x: snap(centre - width / 2),
        y: isStage
          ? snap((empty ? 200 : bounds.minY) - height - 60)
          : snap((empty ? 200 : bounds.minY + bounds.height) + 40),
        width,
        height,
      };
      return commit(state, { ...layout, decor: [...layout.decor, decor] }, action.key);
    }
    case "updateSection":
      return commit(
        state,
        mapSections(
          layout,
          action.key,
          (section) => ({ ...section, ...action.changes }) as Section,
        ),
      );
    case "updateDecor": {
      if (!layout.decor.some((decor) => decor.key === action.key)) return state;
      return commit(state, {
        ...layout,
        decor: layout.decor.map((decor) =>
          decor.key === action.key ? { ...decor, ...action.changes } : decor,
        ),
      });
    }
    case "move": {
      const x = snap(action.x);
      const y = snap(action.y);
      const moved = mapSections(layout, action.key, (section) =>
        section.x === x && section.y === y ? section : { ...section, x, y },
      );
      if (moved !== layout) return commit(state, moved);
      const decor = layout.decor.find((item) => item.key === action.key);
      if (!decor || (decor.x === x && decor.y === y)) return state;
      return commit(state, {
        ...layout,
        decor: layout.decor.map((item) => (item.key === action.key ? { ...item, x, y } : item)),
      });
    }
    case "remove": {
      const next = {
        ...layout,
        sections: layout.sections.filter((section) => section.key !== action.key),
        decor: layout.decor.filter((decor) => decor.key !== action.key),
      };
      if (
        next.sections.length === layout.sections.length &&
        next.decor.length === layout.decor.length
      ) {
        return state;
      }
      return commit(state, next, state.selected === action.key ? null : state.selected);
    }
    case "toggleSeat": {
      const ref = seatRefOf(action.row, action.seat);
      return commit(
        state,
        mapSections(layout, action.sectionKey, (section) => {
          if (section.kind !== "seated") return section;
          if (action.row >= section.rows || action.seat >= section.seatsPerRow) return section;
          if (action.flag === "removed") {
            // A seat that no longer exists cannot also be an accessible seat.
            return {
              ...section,
              removed: toggled(section.removed, ref),
              accessible: section.accessible.filter((item) => item !== ref),
            };
          }
          if (section.removed.includes(ref)) return section;
          return { ...section, accessible: toggled(section.accessible, ref) };
        }),
      );
    }
    case "select":
      return state.selected === action.key ? state : { ...state, selected: action.key };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        layout: previous,
        selected: keep(previous, state.selected),
        past: state.past.slice(0, -1),
        future: [layout, ...state.future],
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        layout: next,
        selected: keep(next, state.selected),
        past: [...state.past, layout],
        future: rest,
      };
    }
  }
}

/** The selection, if what it points at still exists in `layout`. */
function keep(layout: Layout, selected: string | null): string | null {
  const exists =
    layout.sections.some((section) => section.key === selected) ||
    layout.decor.some((decor) => decor.key === selected);
  return exists ? selected : null;
}

/** A name not yet used by any section: "Section 1", "Section 2", … */
export function nextSectionName(layout: Layout, base: string): string {
  const taken = new Set(layout.sections.map((section) => section.name.toLowerCase()));
  for (let n = layout.sections.length + 1; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
