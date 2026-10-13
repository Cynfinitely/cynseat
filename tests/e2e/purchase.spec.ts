import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { approveOrganization, emailLink, enablePayments } from "./support/db";
import { publishEvent, registerOrganization, signUp, uniqueId } from "./support/users";

const noViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
};

/** An organizer with an approved, payment-ready organization. */
async function organizer(browser: Browser) {
  const owner = await signUp(browser, "Olga Owner");
  const orgSlug = await registerOrganization(owner.page, `Yhdistys ${uniqueId()}`);
  await approveOrganization(orgSlug);
  await enablePayments(orgSlug);
  return { page: owner.page, orgSlug };
}

const guest = async (browser: Browser) => (await browser.newContext()).newPage();

async function chooseTickets(page: Page, eventPath: string, quantity: number) {
  await page.goto(`/en${eventPath}`);
  await page.getByLabel("Standard").selectOption(String(quantity));
  await page.getByRole("button", { name: "Continue" }).click();
}

test.describe("buying tickets", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one run of each journey is enough");
    test.setTimeout(120_000);
  });

  test("a guest gets free tickets with QR codes, on the page and by email", async ({ browser }) => {
    const { page: owner, orgSlug } = await organizer(browser);
    const title = `Free Concert ${uniqueId()}`;
    const eventPath = await publishEvent(owner, orgSlug, { title, price: "0", capacity: 50 });
    const email = `guest-${uniqueId()}@example.com`;

    const page = await guest(browser);
    await page.goto(`/en${eventPath}`);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Choose at least one ticket.")).toBeVisible();

    await page.getByLabel("Standard").selectOption("2");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await expect(page.getByText(/Your tickets are reserved for \d+:\d\d\./).first()).toBeVisible();
    await expect(page.getByText("2 × Standard")).toBeVisible();
    await noViolations(page);

    await page.getByRole("button", { name: "Get tickets" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await page.getByLabel("Full name").fill("Gus Guest");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Get tickets" }).click();

    await expect(page.getByRole("heading", { name: /^Order [2-9A-Z]{8}$/ })).toBeVisible();
    await expect(page.getByText("Thank you, Gus Guest.")).toBeVisible();
    await expect(page.getByRole("img", { name: "QR code for ticket 1" })).toBeVisible();
    await expect(page.getByRole("img", { name: "QR code for ticket 2" })).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
    await noViolations(page);

    // The emailed link opens the same order on a device that has never seen it.
    const link = await emailLink(email, "orderConfirmation");
    expect(new URL(link).pathname).toBe(new URL(page.url()).pathname);
    const phone = await guest(browser);
    await phone.goto(link);
    await expect(phone.getByRole("img", { name: "QR code for ticket 2" })).toBeVisible();

    // The organizer sees the sale.
    await owner.goto(`/en/dashboard/${orgSlug}/events`);
    await expect(owner.getByRole("row").filter({ hasText: title })).toContainText("2 / 50");
  });

  test("a guest pays for tickets, after first backing out of the payment page", async ({
    browser,
  }) => {
    // This organizer connects their payment account through the dashboard.
    const signedUp = await signUp(browser, "Olga Owner");
    const owner = signedUp.page;
    const orgSlug = await registerOrganization(owner, `Yhdistys ${uniqueId()}`);
    await owner.getByRole("link", { name: "Payments" }).click();
    await expect(owner.getByText("Your organization has to be approved by CynSeat")).toBeVisible();
    await approveOrganization(orgSlug);
    await owner.reload();
    await expect(owner.getByText("Not connected")).toBeVisible();
    await noViolations(owner);
    await owner.getByRole("button", { name: "Connect with Stripe" }).click();
    await owner.getByRole("button", { name: "Complete onboarding" }).click();
    await expect(owner.getByText("Ready to take payments")).toBeVisible();

    const title = `Paid Concert ${uniqueId()}`;
    const eventPath = await publishEvent(owner, orgSlug, { title, price: "12,50", capacity: 50 });

    const page = await guest(browser);
    await chooseTickets(page, eventPath, 2);
    await page.getByLabel("Full name").fill("Petra Payer");
    await page.getByLabel("Email").fill(`payer-${uniqueId()}@example.com`);
    await page.getByRole("button", { name: "Pay €25.00" }).click();

    await expect(page.getByRole("heading", { name: "Test payment" })).toBeVisible();
    await expect(page.getByText("€25.00")).toBeVisible();
    await page.getByRole("button", { name: "Cancel and go back" }).click();
    await expect(page.getByText("Payment was cancelled.")).toBeVisible();

    // The same order and payment page are picked up again.
    await page.getByLabel("Full name").fill("Petra Payer");
    await page.getByLabel("Email").fill(`payer-${uniqueId()}@example.com`);
    await page.getByRole("button", { name: "Pay €25.00" }).click();
    await page.getByRole("button", { name: "Pay now" }).click();

    await expect(page.getByRole("heading", { name: /^Order [2-9A-Z]{8}$/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "QR code for ticket 2" })).toBeVisible();
    await expect(page.getByText("€25.00").last()).toBeVisible();

    await owner.goto(`/en/dashboard/${orgSlug}/events`);
    await expect(owner.getByRole("row").filter({ hasText: title })).toContainText("2 / 50");
  });

  test("the last ticket goes to one buyer; the other is told and can see it is sold out", async ({
    browser,
  }) => {
    const { page: owner, orgSlug } = await organizer(browser);
    const eventPath = await publishEvent(owner, orgSlug, {
      title: `Tiny Gig ${uniqueId()}`,
      price: "0",
      capacity: 1,
    });

    const [first, second] = await Promise.all([guest(browser), guest(browser)]);
    await second.goto(`/en${eventPath}`);
    await second.getByLabel("Standard").selectOption("1");

    await chooseTickets(first, eventPath, 1);
    await expect(first.getByRole("heading", { name: "Checkout" })).toBeVisible();

    await second.getByRole("button", { name: "Continue" }).click();
    await expect(
      second.getByText("Those tickets are no longer available. Choose again."),
    ).toBeVisible();
    await expect(second.getByText("Sold out")).toBeVisible();

    // Changing their mind frees the ticket, for themselves and for the other buyer.
    await first.getByRole("button", { name: "Change tickets" }).click();
    await expect(first.getByText("On sale", { exact: true })).toBeVisible();
    await second.reload();
    await expect(second.getByText("On sale", { exact: true })).toBeVisible();
  });

  test("an unknown order link says so without revealing anything", async ({ page }) => {
    const response = await page.goto(`/en/orders/${"a".repeat(43)}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Order not found" })).toBeVisible();
  });
});
