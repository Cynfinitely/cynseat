const TRANSLITERATIONS: Record<string, string> = {
  ı: "i",
  İ: "i",
  ğ: "g",
  Ğ: "g",
  ş: "s",
  Ş: "s",
  ç: "c",
  Ç: "c",
  ö: "o",
  Ö: "o",
  ü: "u",
  Ü: "u",
  ä: "a",
  Ä: "a",
  å: "a",
  Å: "a",
  ß: "ss",
  æ: "ae",
  Æ: "ae",
  ø: "o",
  Ø: "o",
};

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 50;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Words that are, or may become, top-level routes or would mislead buyers.
const RESERVED = new Set([
  "admin",
  "api",
  "account",
  "auth",
  "checkout",
  "cynseat",
  "dashboard",
  "event",
  "events",
  "help",
  "legal",
  "new",
  "orders",
  "organizers",
  "settings",
  "sign-in",
  "sign-up",
  "support",
  "tickets",
  "venues",
  "www",
]);

/** Turns free text into a URL slug: ASCII, lower case, hyphen separated. May return "". */
export function slugify(input: string): string {
  const transliterated = Array.from(input, (char) => TRANSLITERATIONS[char] ?? char).join("");
  return transliterated
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
}

export type SlugProblem = "too_short" | "too_long" | "invalid_characters" | "reserved";

export function checkSlug(slug: string): SlugProblem | null {
  if (slug.length < SLUG_MIN_LENGTH) return "too_short";
  if (slug.length > SLUG_MAX_LENGTH) return "too_long";
  if (!SLUG_PATTERN.test(slug)) return "invalid_characters";
  if (RESERVED.has(slug)) return "reserved";
  return null;
}
