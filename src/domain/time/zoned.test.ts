import { describe, expect, it } from "vitest";
import { fromZonedInput, isTimeZone, toZonedInput } from "./zoned";

const iso = (local: string, zone: string) => fromZonedInput(local, zone)?.toISOString() ?? null;

describe("fromZonedInput", () => {
  it("converts winter and summer times in Helsinki", () => {
    expect(iso("2027-01-10T18:30", "Europe/Helsinki")).toBe("2027-01-10T16:30:00.000Z");
    expect(iso("2027-07-10T18:30", "Europe/Helsinki")).toBe("2027-07-10T15:30:00.000Z");
  });

  it("handles zones west of UTC, half-hour offsets and UTC itself", () => {
    expect(iso("2027-01-10T18:30", "America/New_York")).toBe("2027-01-10T23:30:00.000Z");
    expect(iso("2027-01-10T18:30", "Asia/Kolkata")).toBe("2027-01-10T13:00:00.000Z");
    expect(iso("2027-01-10T18:30", "UTC")).toBe("2027-01-10T18:30:00.000Z");
    expect(iso("2027-06-01T12:00", "Europe/Istanbul")).toBe("2027-06-01T09:00:00.000Z");
  });

  it("rejects a time skipped when clocks go forward", () => {
    // Helsinki: 28 March 2027, 03:00 jumps to 04:00.
    expect(iso("2027-03-28T03:30", "Europe/Helsinki")).toBeNull();
    expect(iso("2027-03-28T02:59", "Europe/Helsinki")).toBe("2027-03-28T00:59:00.000Z");
    expect(iso("2027-03-28T04:00", "Europe/Helsinki")).toBe("2027-03-28T01:00:00.000Z");
  });

  it("picks the earlier instant for a time that happens twice", () => {
    // Helsinki: 31 October 2027, 04:00 goes back to 03:00.
    expect(iso("2027-10-31T03:30", "Europe/Helsinki")).toBe("2027-10-31T00:30:00.000Z");
  });

  it("crosses midnight and year boundaries correctly", () => {
    expect(iso("2027-01-01T00:30", "Europe/Helsinki")).toBe("2026-12-31T22:30:00.000Z");
    expect(iso("2026-12-31T23:30", "America/Los_Angeles")).toBe("2027-01-01T07:30:00.000Z");
  });

  it.each(["2027-02-30T10:00", "2027-13-01T10:00", "2027-01-10T24:00", "2027-01-10", "nope", ""])(
    "rejects malformed input %j",
    (value) => {
      expect(iso(value, "Europe/Helsinki")).toBeNull();
    },
  );

  it("rejects unknown time zones", () => {
    expect(iso("2027-01-10T18:30", "Mars/Olympus")).toBeNull();
  });
});

describe("toZonedInput", () => {
  it("is the inverse of fromZonedInput", () => {
    for (const zone of ["Europe/Helsinki", "Europe/Istanbul", "America/New_York", "Asia/Kolkata"]) {
      for (const local of ["2027-01-10T18:30", "2027-07-04T00:00", "2027-12-31T23:59"]) {
        expect(toZonedInput(fromZonedInput(local, zone)!, zone)).toBe(local);
      }
    }
  });

  it("uses a 24-hour clock at midnight", () => {
    expect(toZonedInput(new Date("2027-01-09T22:00:00Z"), "Europe/Helsinki")).toBe(
      "2027-01-10T00:00",
    );
  });
});

describe("isTimeZone", () => {
  it("recognises IANA names only", () => {
    expect(isTimeZone("Europe/Helsinki")).toBe(true);
    expect(isTimeZone("Not/AZone")).toBe(false);
  });
});
