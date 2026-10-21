import { describe, expect, it } from "vitest";
import { getSafeReturnUrl } from "./safe-redirect";

describe("getSafeReturnUrl", () => {
  it.each(["/", "/dashboard", "/o/acme/e/gala?x=1#top", "/fi/tickets/find"])(
    "keeps same-site path %s",
    (url) => {
      expect(getSafeReturnUrl(url)).toBe(url);
    },
  );

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "\\/evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
  ])("rejects %j", (url) => {
    expect(getSafeReturnUrl(url, "/home")).toBe("/home");
  });

  it("handles missing values and arrays", () => {
    expect(getSafeReturnUrl(undefined)).toBe("/");
    expect(getSafeReturnUrl(null, "/x")).toBe("/x");
    expect(getSafeReturnUrl(["/a", "/b"])).toBe("/a");
    expect(getSafeReturnUrl(["//evil.com", "/b"])).toBe("/");
  });
});
