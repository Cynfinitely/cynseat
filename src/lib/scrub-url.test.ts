import { describe, expect, it } from "vitest";
import { scrubUrl } from "./scrub-url";

describe("scrubUrl", () => {
  it.each([
    ["https://cynseat.app/en/orders/abc.def-123", "https://cynseat.app/en/orders/[token]"],
    ["/api/orders/abc.def-123/tickets.pdf", "/api/orders/[token]/tickets.pdf"],
    ["/en/reset-password?token=secret", "/en/reset-password"],
    ["/en/orders/abc#ticket-2", "/en/orders/[token]"],
  ])("hides the secret in %s", (url, expected) => {
    expect(scrubUrl(url)).toBe(expected);
  });

  it("leaves ordinary paths alone", () => {
    expect(scrubUrl("/en/o/acme/e/gala")).toBe("/en/o/acme/e/gala");
  });
});
