/** IANA time zones for a select box, with the most likely ones for CynSeat's users first. */
export function timeZoneOptions(): { common: string[]; all: string[] } {
  const common = [
    "Europe/Helsinki",
    "Europe/Istanbul",
    "Europe/Stockholm",
    "Europe/Berlin",
    "Europe/London",
  ];
  const all = Intl.supportedValuesOf("timeZone").filter((zone) => !common.includes(zone));
  return { common, all };
}
