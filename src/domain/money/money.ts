/** Currencies an event can be priced in. Lower case, as Stripe writes them. */
export const currencies = [
  "eur",
  "sek",
  "nok",
  "dkk",
  "gbp",
  "chf",
  "pln",
  "czk",
  "usd",
  "try",
] as const;
export type Currency = (typeof currencies)[number];

export function isCurrency(value: string): value is Currency {
  return (currencies as readonly string[]).includes(value);
}

/** How many decimal places the currency has (2 for euros, 0 for yen). */
export function minorUnitDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/** Formats an amount held in minor units (cents), e.g. 1250 -> "€12.50". */
export function formatMoney(amountMinor: number, currency: string, locale: string): string {
  const digits = minorUnitDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountMinor / 10 ** digits);
}

/** The amount as a plain decimal string for a form field, e.g. 1250 -> "12.50". */
export function toMoneyInput(amountMinor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  return (amountMinor / 10 ** digits).toFixed(digits);
}

/**
 * Parses what a person typed as a price ("12", "12.5", "12,50") into minor units.
 * Returns null for anything that is not a non-negative amount with at most the
 * currency's number of decimals. No floating-point arithmetic is involved.
 */
export function parseMoneyInput(input: string, currency: string): number | null {
  const digits = minorUnitDigits(currency);
  const match = /^(\d{1,9})(?:[.,](\d+))?$/.exec(input.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return null;
  return Number(match[1]) * 10 ** digits + Number(fraction.padEnd(digits, "0") || "0");
}
