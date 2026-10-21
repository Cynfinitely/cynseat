import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { approveOrganization, enablePayments } from "./support/db";
import { registerOrganization, signUp, uniqueId } from "./support/users";

const noViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
};

const seat = (page: Page, row: string, number: number) =>
  page.getByRole("button", { name: new RegExp(`^Stalls · row ${row} · seat ${number},`) });

test("an organizer draws a seat map and buyers choose their seats", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run of the full journey is enough");
  test.setTimeout(180_000);
  const id = uniqueId();

  const owner = await signUp(browser, "Olga Owner");
  const { page } = owner;
  const orgSlug = await registerOrganization(page, `Teatteri ${id}`);
  await approveOrganization(orgSlug);
  await enablePayments(orgSlug);

  await test.step("create a draft event at a venue", async () => {
    await page.goto(`/en/dashboard/${orgSlug}/events/new`);
    await page.getByLabel("Event name").fill(`Seated Show ${id}`);
    await page.getByLabel("Starts").fill("2030-06-15T19:00");
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.getByRole("link", { name: "Seating", exact: true }).click();
    await expect(page.getByText("Choose a venue first")).toBeVisible();

    await page.getByRole("link", { name: "Venue", exact: true }).click();
    await page.getByLabel("Venue name").fill(`Sali ${id}`);
    await page.getByLabel("Street address").fill("Teatterikuja 1");
    await page.getByRole("textbox", { name: "City" }).fill("Vantaa");
    await page.getByRole("button", { name: "Add venue and use it" }).click();
    await expect(page.getByText("Teatterikuja 1, Vantaa")).toBeVisible();
  });
  const eventUrl = page.url().replace(/\/venue$/, "");

  await test.step("draw a seat map: three rows of four, minus one seat for an aisle", async () => {
    await page.goto(`${eventUrl}/seating`);
    await page.getByLabel("Name for a new map").fill("Main hall");
    await page.getByRole("button", { name: "Draw a new seat map" }).click();
    await expect(page.getByRole("heading", { name: "Seat map" })).toBeVisible();
    await expect(page.getByText("0 of 5000 seats")).toBeVisible();

    await page.getByRole("button", { name: "Add stage" }).click();
    await page.getByRole("button", { name: "Add seats" }).click();
    await expect(page.getByText("50 of 5000 seats")).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("Stalls");
    await page.getByLabel("Rows").fill("3");
    await page.getByLabel("Seats per row").fill("4");
    await expect(page.getByText("12 of 5000 seats")).toBeVisible();

    await page.getByLabel("Clicking a seat").selectOption("removed");
    await page.getByRole("button", { name: "Stalls, row C, seat 4" }).click();
    await expect(page.getByText("11 of 5000 seats")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("12 of 5000 seats")).toBeVisible();
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByText("11 of 5000 seats")).toBeVisible();
    await expect(page.getByText("You have changes that are not saved.")).toBeVisible();
    await noViolations(page);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  });

  await test.step("give the event its own copy and price the section", async () => {
    await page.goto(`${eventUrl}/seating`);
    await page.getByRole("button", { name: "Use this map Main hall" }).click();
    await expect(page.getByText("its own copy of a seat map with 11 seats")).toBeVisible();
    await expect(page.getByText("No prices yet.")).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill("Stalls");
    await page.getByLabel("Price (EUR)").fill("20");
    await page.getByRole("checkbox", { name: "Stalls" }).check();
    await page.getByRole("button", { name: "Add ticket type" }).click();
    await expect(page.getByText("€20.00")).toBeVisible();

    // A seat kept back for the sound desk.
    await page.getByRole("button", { name: "Stalls, row C, seat 1, On sale" }).click();
    await expect(page.getByText("1 seat(s) updated.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Stalls, row C, seat 1, Off sale" }),
    ).toBeVisible();
    await noViolations(page);

    await page.getByRole("button", { name: "Publish event" }).click();
    await expect(page.getByText("This event is published.")).toBeVisible();
  });
  const eventPath = (await page
    .getByRole("link", { name: "View public page" })
    .getAttribute("href"))!;

  const ada = await (await browser.newContext()).newPage();
  const ben = await (await browser.newContext()).newPage();

  await test.step("two buyers choose the same seat; the first to continue gets it", async () => {
    await ada.goto(eventPath);
    await ada.getByRole("link", { name: "Choose seats" }).click();
    await expect(ada.getByRole("heading", { name: "Choose your seats" })).toBeVisible();
    await expect(seat(ada, "C", 1)).toHaveAttribute("aria-disabled", "true");
    await noViolations(ada);

    await ben.goto(`${eventPath}/seats`);
    await seat(ben, "A", 2).click();
    await seat(ben, "A", 3).click();

    await seat(ada, "A", 2).click();
    await expect(ada.getByText("Stalls · row A · seat 2").first()).toBeVisible();
    await expect(ada.getByText("€20.00").last()).toBeVisible();
    await ada.getByRole("button", { name: "Continue" }).click();
    await expect(ada.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await expect(ada.getByText("Stalls · row A · seat 2")).toBeVisible();

    await ben.getByRole("button", { name: "Continue" }).click();
    await expect(ben.getByText("Some of those seats were just taken.")).toBeVisible();
    await expect(seat(ben, "A", 2)).toHaveAttribute("aria-disabled", "true");
    // The seat that was still free stays in the selection.
    await expect(seat(ben, "A", 3)).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("seats can be chosen from the keyboard and from the list", async () => {
    await seat(ben, "B", 1).focus();
    await ben.keyboard.press("ArrowRight");
    await ben.keyboard.press("Enter");
    await expect(seat(ben, "B", 2)).toHaveAttribute("aria-pressed", "true");

    await ben.getByLabel("Seat", { exact: true }).selectOption({ label: "C · 2" });
    await ben.getByRole("button", { name: "Add seat" }).click();
    await expect(seat(ben, "C", 2)).toHaveAttribute("aria-pressed", "true");
    await expect(ben.getByText("€60.00")).toBeVisible();
  });

  await test.step("on a phone the whole map fits the screen, and zoom makes it bigger", async () => {
    const phone = await (
      await browser.newContext({ viewport: { width: 390, height: 780 } })
    ).newPage();
    await phone.goto(`${eventPath}/seats`);
    const map = phone.getByRole("group", { name: /^Seat map\./ });
    const fitted = (await map.boundingBox())!;
    expect(fitted.width).toBeLessThanOrEqual(390);
    // The page itself never scrolls sideways.
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );

    await phone.getByRole("button", { name: "+" }).click();
    expect((await map.boundingBox())!.width).toBeGreaterThan(fitted.width);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await phone.context().close();
  });

  await test.step("the buyer pays and gets a ticket naming the seat", async () => {
    await ada.getByLabel("Full name").fill("Ada Buyer");
    await ada.getByLabel("Email").fill(`ada-${id}@example.com`);
    await ada.getByRole("button", { name: "Pay €20.00" }).click();
    await ada.getByRole("button", { name: "Pay now" }).click();
    await expect(ada.getByRole("img", { name: "QR code for ticket 1" })).toBeVisible();
    await expect(ada.getByText("Stalls · row A · seat 2")).toBeVisible();
  });

  await test.step("the organizer sees the seat as sold", async () => {
    await page.goto(`${eventUrl}/seating`);
    await expect(page.getByRole("img", { name: "Stalls, row A, seat 2, Sold" })).toBeVisible();
    await expect(
      page.getByText("The seat map can only be changed while the event is a draft"),
    ).toBeVisible();
  });
});
