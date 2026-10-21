import { describe, expect, it } from "vitest";
import { checkSlug, slugify, SLUG_MAX_LENGTH } from "./slug";

describe("slugify", () => {
  it.each([
    ["Tiyatro Maydanoz", "tiyatro-maydanoz"],
    ["Bir Masal Gibi Anlat", "bir-masal-gibi-anlat"],
    ["IŞIĞIN Çöğürü", "isigin-coguru"],
    ["Kesäjuhla Åbo 2027!", "kesajuhla-abo-2027"],
    ["  --Hello__World--  ", "hello-world"],
    ["Café déjà vu", "cafe-deja-vu"],
    ["日本語", ""],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(SLUG_MAX_LENGTH - 1)} b c`);
    expect(slug).toHaveLength(SLUG_MAX_LENGTH - 1);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("always produces a slug that passes the character check when long enough", () => {
    for (const input of ["Örnek Etkinlik", "Hyvä Ilta", "A.B.C. d/e"]) {
      expect(checkSlug(slugify(input))).toBeNull();
    }
  });
});

describe("checkSlug", () => {
  it.each([
    ["ab", "too_short"],
    ["a".repeat(51), "too_long"],
    ["Has-Caps", "invalid_characters"],
    ["double--hyphen", "invalid_characters"],
    ["-leading", "invalid_characters"],
    ["trailing-", "invalid_characters"],
    ["ünïcode", "invalid_characters"],
    ["dashboard", "reserved"],
    ["admin", "reserved"],
  ] as const)("%s is %s", (slug, problem) => {
    expect(checkSlug(slug)).toBe(problem);
  });

  it("accepts ordinary slugs", () => {
    expect(checkSlug("tiyatro-maydanoz")).toBeNull();
    expect(checkSlug("ngo2027")).toBeNull();
  });
});
