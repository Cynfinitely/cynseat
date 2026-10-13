// Events happen at a wall-clock time in the event's own time zone. These helpers convert
// between that local time ("2027-01-10T18:30") and the instant stored in the database.

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function partsIn(instant: Date, timeZone: string): Parts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
  };
}

const asUtc = (p: Parts): number => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

/** The wall-clock time in `timeZone` at `instant`, as "YYYY-MM-DDTHH:mm". */
export function toZonedInput(instant: Date, timeZone: string): string {
  const p = partsIn(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The instant at which clocks in `timeZone` show `local`.
 * Returns null for malformed input and for times that do not exist (skipped when clocks go
 * forward). A time that occurs twice (when clocks go back) resolves to the earlier one.
 */
export function fromZonedInput(local: string, timeZone: string): Date | null {
  const match = LOCAL_PATTERN.exec(local);
  if (!match || !isTimeZone(timeZone)) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wanted = asUtc({ year, month, day, hour, minute });
  // Reject impossible calendar values such as month 13 or 30 February.
  const check = new Date(wanted);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return null;
  }

  // The zone's offset at a nearby instant gives a first guess; offsets on either side of a
  // transition give the other candidates.
  const candidates = new Set<number>();
  for (const probe of [wanted - 86_400_000, wanted, wanted + 86_400_000]) {
    const offset = asUtc(partsIn(new Date(probe), timeZone)) - probe;
    candidates.add(wanted - offset);
  }
  const matches = [...candidates]
    .filter((candidate) => asUtc(partsIn(new Date(candidate), timeZone)) === wanted)
    .sort((a, b) => a - b);
  return matches.length > 0 ? new Date(matches[0]!) : null;
}
