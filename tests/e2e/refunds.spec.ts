import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { approveOrganization, emailLink, enablePayments } from "./support/db";
import { publishEvent, registerOrganization, signUp, uniqueId } from "./support/users";

async function buy(browser: Browser, eventPath: string, quantity: number, name: string) {
  const email = `${name.toLowerCase().replace(/\W+/g, "-")}-${uniqueId()}@example.com`;
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/en${eventPath}`);
  await page.getByLabel("Standard").selectOption(String(quantity));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /^Pay/ }).click();
  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page.getByRole("img", { name: `QR code for ticket ${quantity}` })).toBeVisible();
  return { page, email };
}

const orderCard = (page: Page, buyerName: string) =>
  page.getByRole("listitem").filter({ hasText: buyerName });

test("an admin refunds one ticket, then cancelling the event refunds everyone else", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run of the full journey is enough");
  test.setTimeout(150_000);

  const owner = await signUp(browser, "Olga Owner");
  const orgSlug = await registerOrganization(owner.page, `Hyvitys ${uniqueId()}`);
  await approveOrganization(orgSlug);
  await enablePayments(orgSlug);
  const eventPath = await publishEvent(owner.page, orgSlug, {
    title: `Refund Night ${uniqueId()}`,
    price: "12,50",
    capacity: 10,
  });
  const eventUrl = owner.page.url().replace(/\/tickets$/, "");

  const ada = await buy(browser, eventPath, 2, "Ada Buyer");
  const ben = await buy(browser, eventPath, 1, "Ben Buyer");

  const { page } = owner;
  await page.goto(`${eventUrl}/orders`);
  await expect(orderCard(page, "Ada Buyer")).toContainText("Total €25.00");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await test.step("refund one of Ada's two tickets", async () => {
    const card = orderCard(page, "Ada Buyer");
    await card.getByRole("button", { name: "Refund selected tickets" }).click();
    await expect(card.getByText("Select at least one ticket.")).toBeVisible();

    await card.getByRole("checkbox", { name: "Refund Standard, ticket 1" }).check();
    page.once("dialog", (dialog) => {
      // Only the one ticket's price is quoted, not the whole order.
      expect(dialog.message()).toContain("€12.50");
      void dialog.accept();
    });
    await card.getByRole("button", { name: "Refund selected tickets" }).click();
    await expect(card.getByText("Refund sent.")).toBeVisible();
    await expect(card.getByText("Refunded €12.50")).toBeVisible();
    await expect(card.getByText("Void", { exact: true })).toHaveCount(1);
    await expect(card.getByText("Valid", { exact: true })).toHaveCount(1);
  });

  await test.step("Ada sees one ticket left and is told about the refund", async () => {
    await ada.page.reload();
    await expect(ada.page.getByText("This ticket is no longer valid.")).toBeVisible();
    await expect(ada.page.getByRole("img", { name: /QR code/ })).toHaveCount(1);
    await expect(ada.page.getByText("Refunded: €12.50")).toBeVisible();
    expect(await emailLink(ada.email, "orderRefunded")).toContain("/en/orders/");
  });

  await test.step("the refunded ticket is on sale again", async () => {
    await page.goto(`/en/dashboard/${orgSlug}/events`);
    await expect(page.getByRole("row").filter({ hasText: "Refund Night" })).toContainText("2 / 10");
  });

  await test.step("cancelling the event refunds every remaining ticket", async () => {
    await page.goto(eventUrl);
    await page.getByLabel("Reason shown to buyers").fill("Venue flooded");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel event" }).click();
    await expect(page.getByText("This event is cancelled.")).toBeVisible();

    await page.goto(`${eventUrl}/orders`);
    await expect(orderCard(page, "Ada Buyer")).toContainText("Refunded €25.00");
    await expect(orderCard(page, "Ben Buyer")).toContainText("Refunded €12.50");
    await expect(page.getByText("Valid", { exact: true })).toHaveCount(0);

    await ben.page.reload();
    await expect(ben.page.getByText("This event has been cancelled.")).toBeVisible();
    await expect(ben.page.getByText("This ticket is no longer valid.")).toBeVisible();
    expect(await emailLink(ben.email, "orderRefunded")).toContain("/en/orders/");
  });
});
