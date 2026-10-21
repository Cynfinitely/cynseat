import { describe, expect, it } from "vitest";
import { pickTranslation, publishProblemsFor, remainingOf, saleStateOf } from "./rules";

const now = new Date("2027-01-01T12:00:00Z");
const later = new Date("2027-02-01T18:00:00Z");

describe("publishProblemsFor", () => {
  const ready = {
    orgApproved: true,
    hasDefaultTitle: true,
    hasPlace: true,
    startsAt: later,
    now,
    activeTicketTypes: 1,
    hasPaidTickets: true,
    paymentsReady: true,
  };

  it("finds nothing wrong with a complete event", () => {
    expect(publishProblemsFor(ready)).toEqual([]);
  });

  it("reports every problem, most fundamental first", () => {
    expect(
      publishProblemsFor({
        orgApproved: false,
        hasDefaultTitle: false,
        hasPlace: false,
        startsAt: now,
        now,
        activeTicketTypes: 0,
        hasPaidTickets: false,
        paymentsReady: false,
      }),
    ).toEqual([
      "org_not_approved",
      "missing_title",
      "missing_venue",
      "starts_in_past",
      "no_ticket_types",
    ]);
  });

  it.each([
    [{ orgApproved: false }, "org_not_approved"],
    [{ hasDefaultTitle: false }, "missing_title"],
    [{ hasPlace: false }, "missing_venue"],
    [{ startsAt: new Date("2026-12-31T00:00:00Z") }, "starts_in_past"],
    [{ activeTicketTypes: 0 }, "no_ticket_types"],
    [{ paymentsReady: false }, "payments_not_ready"],
  ] as const)("flags %j alone", (change, problem) => {
    expect(publishProblemsFor({ ...ready, ...change })).toEqual([problem]);
  });

  it("lets free events be published without a payment account", () => {
    expect(publishProblemsFor({ ...ready, hasPaidTickets: false, paymentsReady: false })).toEqual(
      [],
    );
  });
});

describe("pickTranslation", () => {
  const rows = [
    { locale: "tr", title: "Bir Masal" },
    { locale: "en", title: "A Tale" },
  ];

  it("prefers the reader's language, then the default, then anything", () => {
    expect(pickTranslation(rows, "en", "tr")?.title).toBe("A Tale");
    expect(pickTranslation(rows, "fi", "tr")?.title).toBe("Bir Masal");
    expect(pickTranslation([rows[1]!], "fi", "tr")?.title).toBe("A Tale");
    expect(pickTranslation([], "fi", "tr")).toBeUndefined();
  });
});

describe("saleStateOf", () => {
  const type = { capacity: 10, qtySold: 0, qtyHeld: 0, salesStartAt: null, salesEndAt: null };

  it("is on sale by default until the event starts", () => {
    expect(saleStateOf(type, later, now)).toBe("on_sale");
    expect(saleStateOf(type, later, later)).toBe("ended");
  });

  it("respects the sales window", () => {
    const opens = new Date("2027-01-10T00:00:00Z");
    const closes = new Date("2027-01-20T00:00:00Z");
    const windowed = { ...type, salesStartAt: opens, salesEndAt: closes };
    expect(saleStateOf(windowed, later, now)).toBe("not_started");
    expect(saleStateOf(windowed, later, opens)).toBe("on_sale");
    expect(saleStateOf(windowed, later, closes)).toBe("ended");
  });

  it("counts held tickets as unavailable", () => {
    expect(saleStateOf({ ...type, qtySold: 6, qtyHeld: 4 }, later, now)).toBe("sold_out");
    expect(saleStateOf({ ...type, qtySold: 6, qtyHeld: 3 }, later, now)).toBe("on_sale");
    expect(remainingOf({ capacity: 10, qtySold: 6, qtyHeld: 3 })).toBe(1);
    expect(remainingOf({ capacity: 10, qtySold: 8, qtyHeld: 5 })).toBe(0);
  });

  it("treats seated types, which have no capacity of their own, as not sold out here", () => {
    expect(saleStateOf({ ...type, capacity: null }, later, now)).toBe("on_sale");
    expect(remainingOf({ capacity: null, qtySold: 0, qtyHeld: 0 })).toBeNull();
  });
});
