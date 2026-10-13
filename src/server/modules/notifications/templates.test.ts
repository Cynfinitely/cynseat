import { describe, expect, it } from "vitest";
import { emailLocales, renderEmail, toEmailLocale, type EmailTemplate } from "./templates";

const samples: EmailTemplate[] = [
  { template: "verifyEmail", data: { name: "Aino", url: "https://x.test/v?token=1" } },
  { template: "resetPassword", data: { name: "Aino", url: "https://x.test/r?token=1" } },
  {
    template: "orgInvitation",
    data: {
      inviter: "Metin",
      organization: "Tiyatro",
      role: "door_staff",
      url: "https://x.test/i",
    },
  },
  { template: "orgApproved", data: { organization: "Tiyatro", url: "https://x.test/d" } },
  {
    template: "orgRejected",
    data: { organization: "Tiyatro", url: "https://x.test/d", note: "No" },
  },
  { template: "orgSuspended", data: { organization: "Tiyatro", url: "https://x.test/d" } },
];

describe("renderEmail", () => {
  for (const locale of emailLocales) {
    for (const sample of samples) {
      it(`${sample.template} renders in ${locale} with no unfilled placeholders`, () => {
        const email = renderEmail(locale, sample);
        for (const part of [email.subject, email.text, email.html]) {
          expect(part).not.toMatch(/\{\w+\}/);
        }
        expect(email.text).toContain(sample.data.url);
        expect(email.html).toContain(`lang="${locale}"`);
      });
    }
  }

  it("translates the role in invitations", () => {
    const email = renderEmail("fi", samples[2]!);
    expect(email.text).toContain("ovihenkilökunta");
    expect(email.text).not.toContain("door_staff");
  });

  it("includes the reviewer's note when there is one", () => {
    expect(renderEmail("en", samples[4]!).text).toContain("Note from the CynSeat team: No");
    expect(renderEmail("en", samples[3]!).text).not.toContain("Note from");
  });

  it("escapes user-supplied values in HTML but not in text", () => {
    const email = renderEmail("en", {
      template: "orgInvitation",
      data: {
        inviter: `<script>alert(1)</script>`,
        organization: `A & B "Co"`,
        role: "member",
        url: "https://x.test/i?a=1&b=2",
      },
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("A &amp; B &quot;Co&quot;");
    expect(email.html).toContain('href="https://x.test/i?a=1&amp;b=2"');
    expect(email.text).toContain(`A & B "Co"`);
  });
});

describe("toEmailLocale", () => {
  it("falls back to English", () => {
    expect(toEmailLocale("tr")).toBe("tr");
    expect(toEmailLocale("de")).toBe("en");
    expect(toEmailLocale(undefined)).toBe("en");
  });
});
