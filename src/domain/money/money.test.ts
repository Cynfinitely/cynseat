import { describe, expect, it } from "vitest";
import { formatMoney, isCurrency, minorUnitDigits, parseMoneyInput, toMoneyInput } from "./money";

describe("parseMoneyInput", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12,50", 1250],
    ["0", 0],
    ["0.07", 7],
    [" 5 ", 500],
    ["19.99", 1999],
    ["1000000", 100000000],
  ])("%s -> %d cents", (input, expected) => {
    expect(parseMoneyInput(input, "eur")).toBe(expected);
  });

  it.each(["", "abc", "-5", "12.345", "1.2.3", "12,", "€12", "1e3", "12 50"])(
    "rejects %j",
    (input) => {
      expect(parseMoneyInput(input, "eur")).toBeNull();
    },
  );

  it("never loses a cent to floating point", () => {
    for (const cents of [1, 7, 29, 105, 1999, 4335, 99999]) {
      expect(parseMoneyInput(toMoneyInput(cents, "eur"), "eur")).toBe(cents);
    }
  });

  it("respects currencies without decimals", () => {
    expect(minorUnitDigits("jpy")).toBe(0);
    expect(parseMoneyInput("500", "jpy")).toBe(500);
    expect(parseMoneyInput("500.5", "jpy")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats for the reader's locale", () => {
    expect(formatMoney(1250, "eur", "en")).toBe("€12.50");
    expect(formatMoney(1250, "eur", "fi").replace(/\s/g, " ")).toBe("12,50 €");
    expect(formatMoney(0, "eur", "en")).toBe("€0.00");
  });
});

describe("isCurrency", () => {
  it("accepts supported lower-case codes only", () => {
    expect(isCurrency("eur")).toBe(true);
    expect(isCurrency("EUR")).toBe(false);
    expect(isCurrency("xyz")).toBe(false);
  });
});
