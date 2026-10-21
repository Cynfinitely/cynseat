import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ticketCode } from "../../src/domain/tokens/tokens";
import { approveOrganization, emailLink, ticketIdsFor } from "./support/db";
import { publishEvent, registerOrganization, signUp, uniqueId } from "./support/users";

// The same key the test server signs tickets with (see playwright.config.ts).
const SIGNING_SECRET = "e2e-only-signing-secret-0123456789abcdef";

test("door staff check tickets in, and each ticket works once", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run of the full journey is enough");
  test.setTimeout(120_000);

  const owner = await signUp(browser, "Olga Owner");
  const orgSlug = await registerOrganization(owner.page, `Ovi ${uniqueId()}`);
  await approveOrganization(orgSlug);
  const eventPath = await publishEvent(owner.page, orgSlug, {
    title: `Door Night ${uniqueId()}`,
    price: "0",
    capacity: 20,
  });
  const eventUrl = owner.page.url().replace(/\/tickets$/, "");

  // A guest gets two tickets.
  const email = `guest-${uniqueId()}@example.com`;
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/en${eventPath}`);
  await guest.getByLabel("Standard").selectOption("2");
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByLabel("Full name").fill("Gus Guest");
  await guest.getByLabel("Email").fill(email);
  await guest.getByRole("button", { name: "Get tickets" }).click();
  await expect(guest.getByRole("img", { name: "QR code for ticket 2" })).toBeVisible();
  const [first, second] = (await ticketIdsFor(email)).map((id) =>
    ticketCode(SIGNING_SECRET, id, 1),
  );

  // The owner invites a volunteer as door staff.
  const door = await signUp(browser, "Dan Door");
  await owner.page.goto(`/en/dashboard/${orgSlug}/members`);
  await owner.page.getByLabel("Email").fill(door.email);
  await owner.page.getByLabel("Role", { exact: true }).selectOption("door_staff");
  await owner.page.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.page.getByText(`Invitation sent to ${door.email}.`)).toBeVisible();
  await door.page.goto(await emailLink(door.email, "orgInvitation"));
  await door.page.getByRole("button", { name: "Accept invitation" }).click();

  const { page } = door;
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("link", { name: /Door Night/ }).click();
  await page.getByRole("link", { name: "Check-in" }).click();
  await expect(page.getByText("0 of 2 checked in")).toBeVisible();
  await expect(page.getByText("Ready to scan")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const check = async (code: string) => {
    await page.getByLabel("Ticket code").fill(code);
    await page.getByRole("button", { name: "Check ticket" }).click();
  };

  await check(first!);
  await expect(page.getByText("Valid. Let them in.")).toBeVisible();
  await expect(page.getByText(/Standard · Gus Guest · order [2-9A-Z]{8}/)).toBeVisible();
  await expect(page.getByText("1 of 2 checked in")).toBeVisible();
  // Door staff cannot reverse a check-in.
  await expect(page.getByRole("button", { name: "Undo check-in" })).toHaveCount(0);

  await check(first!);
  await expect(page.getByText("Already used")).toBeVisible();
  await expect(page.getByText(/Used at \d/)).toBeVisible();
  await expect(page.getByText("1 of 2 checked in")).toBeVisible();

  await check("CS1.not-a-real-ticket.AAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByText("Not a valid ticket")).toBeVisible();

  await check(second!);
  await expect(page.getByText("Valid. Let them in.")).toBeVisible();
  await expect(page.getByText("2 of 2 checked in")).toBeVisible();

  // The buyer's own page shows the tickets as used.
  await guest.reload();
  await expect(guest.getByText("Checked in")).toHaveCount(2);

  // The owner can undo a mistaken check-in; door staff see only what they need.
  await owner.page.goto(`${eventUrl}/check-in`);
  await owner.page.getByLabel("Ticket code").fill(second!);
  await owner.page.getByRole("button", { name: "Check ticket" }).click();
  await owner.page.getByRole("button", { name: "Undo check-in" }).click();
  await expect(owner.page.getByText("1 of 2 checked in")).toBeVisible();
});
