// Fails when the locale folders under messages/ do not have identical files and keys.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "messages";
const REFERENCE = "en";

function keysOf(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

function load(locale: string): Map<string, Set<string>> {
  const files = readdirSync(join(ROOT, locale)).filter((file) => file.endsWith(".json"));
  return new Map(
    files.map((file) => [
      file,
      new Set(keysOf(JSON.parse(readFileSync(join(ROOT, locale, file), "utf8")))),
    ]),
  );
}

const locales = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const reference = load(REFERENCE);
const problems: string[] = [];

for (const locale of locales.filter((name) => name !== REFERENCE)) {
  const current = load(locale);
  for (const file of new Set([...reference.keys(), ...current.keys()])) {
    const expected = reference.get(file);
    const actual = current.get(file);
    if (!expected) problems.push(`${locale}/${file}: file has no ${REFERENCE} counterpart`);
    else if (!actual) problems.push(`${locale}/${file}: file is missing`);
    else {
      for (const key of expected)
        if (!actual.has(key)) problems.push(`${locale}/${file}: missing "${key}"`);
      for (const key of actual)
        if (!expected.has(key)) problems.push(`${locale}/${file}: extra "${key}"`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Messages match across ${locales.join(", ")}.`);
