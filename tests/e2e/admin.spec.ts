import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { approveOrganization, grantPlatformAdmin } from "./support/db";
import { registerOrganization, signUp, uniqueId } from "./support/users";

test("a platform admin merges duplicate venues and reads the audit log", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  test.setTimeout(120_000);
  const id = uniqueId();

  // An organizer adds the same hall twice under slightly different names.
  const owner = await signUp(browser, "Olga Owner");
  const orgSlug = await registerOrganization(owner.page, `Kopio ${id}`);
  await approveOrganization(orgSlug);
  for (const name of [`Kulttuuritalo ${id}`, `Kulttuuri-talo ${id}`]) {
    await owner.page.goto(`/en/dashboard/${orgSlug}/events/new`);
    await owner.page.getByLabel("Event name").fill(`Event at ${name}`);
    await owner.page.getByLabel("Starts").fill("2030-06-15T19:00");
    await owner.page.getByRole("button", { name: "Create draft" }).click();
    await owner.page.getByRole("link", { name: "Venue", exact: true }).click();
    await owner.page.getByLabel("Venue name").fill(name);
    await owner.page.getByLabel("Street address").fill("Kulttuurikuja 2");
    await owner.page.getByRole("textbox", { name: "City" }).fill("Espoo");
    await owner.page.getByRole("button", { name: "Add venue and use it" }).click();
    await expect(owner.page.getByText("Kulttuurikuja 2, Espoo")).toBeVisible();
  }

  const admin = await signUp(browser, "Petra Platform");
  await grantPlatformAdmin(admin.email);
  const { page } = admin;
  await page.goto("/en/admin/venues");
  await page.getByRole("searchbox", { name: "Search venues" }).fill(id);
  await page.getByRole("button", { name: "Search" }).click();
  // Cards are told apart by their heading: each card's merge list names the others too.
  const card = (name: string) =>
    page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
  const duplicate = card(`Kulttuuri-talo ${id}`);
  await expect(duplicate).toContainText("1 event");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await duplicate
    .getByRole("combobox")
    .selectOption({ label: `Kulttuuritalo ${id} · Kulttuurikuja 2, Espoo, FI` });
  page.once("dialog", (dialog) => dialog.accept());
  await duplicate.getByRole("button", { name: /^Merge/ }).click();
  await expect(page.getByText("Merged: 1 event(s) and 0 seat map(s) moved.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: `Kulttuuri-talo ${id}` })).toHaveCount(
    0,
  );
  await expect(page.getByRole("listitem").filter({ hasText: `Kulttuuritalo ${id}` })).toContainText(
    "2 events",
  );

  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("cell", { name: "venue.merged" }).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Nobody else gets in.
  expect((await owner.page.goto("/en/admin/venues"))?.status()).toBe(404);
  expect((await owner.page.goto("/en/admin/audit"))?.status()).toBe(404);
});
