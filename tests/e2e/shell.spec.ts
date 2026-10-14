import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { CRON_SECRET } from "../../playwright.config";

const titles = {
  en: "Free ticketing for NGOs and event organizers",
  fi: "Maksuton lipunmyynti järjestöille ja tapahtumanjärjestäjille",
  tr: "STK'lar ve etkinlik düzenleyicileri için ücretsiz biletleme",
} as const;

test("root redirects to the default locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
});

for (const [locale, title] of Object.entries(titles)) {
  test(`home renders in ${locale} with no accessibility violations`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("language switcher keeps the current path", async ({ page }) => {
  await page.goto("/en/does-not-exist");
  await page.getByRole("link", { name: "Suomi" }).click();
  await expect(page).toHaveURL(/\/fi\/does-not-exist$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sivua ei löytynyt");
});

test("unknown pages answer 404 in the visitor's language", async ({ page }) => {
  const response = await page.goto("/tr/nope");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sayfa bulunamadı");
});

test("health endpoint reports the database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: true });
});

test("cron endpoints refuse callers without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/dispatch-emails")).status()).toBe(401);
  const wrong = await request.get("/api/cron/dispatch-emails", {
    headers: { authorization: "Bearer not-the-secret" },
  });
  expect(wrong.status()).toBe(401);

  const right = await request.get("/api/cron/dispatch-emails", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(right.status()).toBe(200);
  expect(await right.json()).toEqual({ sent: expect.any(Number), failed: expect.any(Number) });
});

test("the payment webhook rejects unsigned and forged notifications", async ({ request }) => {
  const body = JSON.stringify({ id: "evt_forged", type: "checkout.session.completed" });
  expect((await request.post("/api/webhooks/payments", { data: body })).status()).toBe(400);
  const forged = await request.post("/api/webhooks/payments", {
    data: body,
    headers: { "x-cynseat-signature": "00".repeat(32) },
  });
  expect(forged.status()).toBe(400);
});

test("pages are sent with security headers", async ({ request }) => {
  const response = await request.get("/en");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  // Plain eval stays forbidden outside development (WebAssembly compilation is allowed).
  expect(headers["content-security-policy"]).not.toContain(" 'unsafe-eval'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("robots.txt keeps private pages out of search engines", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  for (const path of ["/api/", "/*/dashboard", "/*/orders", "/*/checkout", "/*/admin"]) {
    expect(robots).toContain(`Disallow: ${path}`);
  }
  expect(robots).toContain("Sitemap: http://localhost:3100/sitemap.xml");
});
