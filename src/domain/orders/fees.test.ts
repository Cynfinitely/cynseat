import { describe, expect, it } from "vitest";
import { applicationFee, NO_FEE } from "./fees";

describe("applicationFee", () => {
  it("is zero by default", () => {
    expect(applicationFee(12_500, 5, NO_FEE)).toBe(0);
  });

  it("combines a percentage of the total with a fixed amount per ticket", () => {
    expect(applicationFee(10_000, 4, { bps: 250, fixedMinor: 30 })).toBe(250 + 120);
    expect(applicationFee(10_000, 4, { bps: 0, fixedMinor: 30 })).toBe(120);
  });

  it("rounds half up to a whole minor unit", () => {
    expect(applicationFee(999, 1, { bps: 250, fixedMinor: 0 })).toBe(25); // 24.975
    expect(applicationFee(1, 1, { bps: 250, fixedMinor: 0 })).toBe(0); // 0.025
    expect(applicationFee(20, 1, { bps: 250, fixedMinor: 0 })).toBe(1); // 0.5
    expect(applicationFee(19, 1, { bps: 250, fixedMinor: 0 })).toBe(0); // 0.475
  });

  it("never exceeds the order and never applies to free orders", () => {
    expect(applicationFee(50, 3, { bps: 0, fixedMinor: 100 })).toBe(50);
    expect(applicationFee(0, 3, { bps: 1000, fixedMinor: 100 })).toBe(0);
    expect(applicationFee(100, 1, { bps: 10_000, fixedMinor: 0 })).toBe(100);
  });
});
