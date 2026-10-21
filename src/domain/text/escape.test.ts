import { describe, expect, it } from "vitest";
import { escapeHtml, interpolate } from "./escape";

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });
});

describe("interpolate", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(interpolate("Hi {name}, join {org} {missing}", { name: "Aino", org: "NGO" })).toBe(
      "Hi Aino, join NGO {missing}",
    );
  });
});
