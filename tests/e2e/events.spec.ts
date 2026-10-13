import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { approveOrganization, enablePayments } from "./support/db";
import { registerOrganization, signUp, uniqueId } from "./support/users";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const noViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
};

test("an organizer builds, publishes and cancels an event that the public can see", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run of the full journey is enough");
  test.setTimeout(120_000);
  const id = uniqueId();
  const titleFi = `Kesäkonsertti ${id}`;
  const titleEn = `Summer Concert ${id}`;
  const venueName = `Konserttisali ${id}`;

  const owner = await signUp(browser, "Olga Owner");
  const { page } = owner;
  const orgSlug = await registerOrganization(page, `Musiikkiyhdistys ${id}`);

  await test.step("create a draft in Finnish", async () => {
    await page.getByRole("link", { name: "Events", exact: true }).click();
    await expect(page.getByText("No events yet")).toBeVisible();
    await page.getByRole("link", { name: "New event" }).click();
    await page.getByLabel("Event name").fill(titleFi);
    await page.getByLabel("Language of this text").selectOption("fi");
    await page.getByLabel("Starts").fill("2030-06-15T19:00");
    await noViolations(page);
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByRole("heading", { level: 1, name: titleFi })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish event" })).toBeDisabled();
    await expect(page.getByText("Your organization is approved by CynSeat (to do)")).toBeVisible();
    await expect(page.getByText("There is at least one ticket type (to do)")).toBeVisible();
    await noViolations(page);
  });

  await test.step("add a venue to the shared directory", async () => {
    await page.getByRole("link", { name: "Venue", exact: true }).click();
    await expect(page.getByText("No venue chosen yet.")).toBeVisible();
    await page.getByLabel("Venue name").fill(venueName);
    await page.getByLabel("Street address").fill("Musiikkikuja 1");
    await page.getByRole("textbox", { name: "City" }).fill("Vantaa");
    await page.getByLabel("Capacity (optional)").fill("300");
    await page.getByRole("button", { name: "Add venue and use it" }).click();
    await expect(page.getByText("Musiikkikuja 1, Vantaa")).toBeVisible();

    // It can now be found by search, by this or any other organization.
    await page.getByRole("searchbox", { name: "Search venues" }).fill(id);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("button", { name: `Use this venue ${venueName}` })).toBeVisible();
    await noViolations(page);
  });

  await test.step("add a ticket type, with the price typed the Finnish way", async () => {
    await page.getByRole("link", { name: "Tickets", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Aikuinen");
    await page.getByLabel("Price (EUR)").fill("12.345");
    await page.getByLabel("Number of tickets").fill("100");
    await page.getByRole("button", { name: "Add ticket type" }).click();
    await expect(page.getByText("Enter a price such as 12 or 12.50.")).toBeVisible();

    await page.getByLabel("Price (EUR)").fill("12,50");
    await page.getByRole("button", { name: "Add ticket type" }).click();
    await expect(page.getByText("€12.50 · 0 of 100 sold")).toBeVisible();
    await noViolations(page);
  });

  await test.step("write the English text", async () => {
    await page.getByRole("link", { name: "Details", exact: true }).click();
    await page.getByLabel("Text language").selectOption("en");
    await page.getByLabel("Event name").fill(titleEn);
    await page.getByLabel("Short summary").fill("An evening of summer music.");
    await page.getByLabel("Description").fill("First paragraph.\n\nSecond paragraph.");
    await page.getByRole("button", { name: "Save text" }).click();
    await expect(page.getByText("Text saved.")).toBeVisible();
  });

  await test.step("upload a poster, and have a non-image refused", async () => {
    await page.getByLabel("Poster image").setInputFiles({
      name: "poster.png",
      mimeType: "image/png",
      buffer: Buffer.from("<script>alert(1)</script>"),
    });
    await page.getByRole("button", { name: "Upload poster" }).click();
    await expect(page.getByText("Choose a JPEG, PNG or WebP image.")).toBeVisible();

    await page.getByLabel("Poster image").setInputFiles({
      name: "poster.png",
      mimeType: "image/png",
      buffer: Buffer.from(ONE_PIXEL_PNG, "base64"),
    });
    await page.getByRole("button", { name: "Upload poster" }).click();
    await expect(page.getByRole("img", { name: "Current poster" })).toBeVisible();
  });

  await test.step("a draft is not public, and cannot be published before approval", async () => {
    const anonymous = await (await browser.newContext()).newPage();
    const response = await anonymous.goto(`/en/o/${orgSlug}/e/kesakonsertti-${id}`);
    expect(response?.status()).toBe(404);
    await anonymous.context().close();
  });

  await approveOrganization(orgSlug);
  await enablePayments(orgSlug);

  await test.step("publish", async () => {
    await page.reload();
    await expect(page.getByText("This event is ready to publish.")).toBeVisible();
    await page.getByRole("button", { name: "Publish event" }).click();
    await expect(page.getByText("This event is published.")).toBeVisible();
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
  });

  const visitor = await (await browser.newContext()).newPage();
  const eventPath = `/o/${orgSlug}/e/kesakonsertti-${id}`;

  await test.step("the public sees it in their own language", async () => {
    // From the organizer's public page (the home page lists only the soonest events).
    await visitor.goto(`/en/o/${orgSlug}`);
    await visitor.getByRole("link", { name: titleEn }).click();
    await expect(visitor).toHaveURL(new RegExp(`/en${eventPath}$`));
    await expect(visitor.getByRole("heading", { level: 1, name: titleEn })).toBeVisible();
    await expect(visitor.getByText("An evening of summer music.")).toBeVisible();
    // The poster is served and really is an image.
    const poster = visitor.locator("article img").first();
    await expect(poster).toBeVisible();
    const served = await visitor.request.get((await poster.getAttribute("src"))!);
    expect(served.headers()["content-type"]).toBe("image/png");
    await expect(visitor.getByText("Second paragraph.")).toBeVisible();
    await expect(visitor.getByText("Saturday, June 15, 2030")).toBeVisible();
    await expect(visitor.getByText("7:00 PM")).toBeVisible();
    await expect(visitor.getByText(venueName)).toBeVisible();
    await expect(visitor.getByText("€12.50")).toBeVisible();
    await expect(visitor.getByText("On sale", { exact: true })).toBeVisible();
    await noViolations(visitor);

    await visitor.goto(`/fi${eventPath}`);
    await expect(visitor.getByRole("heading", { level: 1, name: titleFi })).toBeVisible();
    await expect(visitor.getByText("12,50 €")).toBeVisible();

    // No Turkish text was written, so the main language is shown and marked as Finnish.
    await visitor.goto(`/tr${eventPath}`);
    const heading = visitor.getByRole("heading", { level: 1, name: titleFi });
    await expect(heading).toHaveAttribute("lang", "fi");

    await visitor.goto(`/en/o/${orgSlug}`);
    await expect(visitor.getByRole("link", { name: titleEn })).toBeVisible();
    await noViolations(visitor);
  });

  await test.step("cancelling shows the reason to the public and removes it from listings", async () => {
    await page.getByLabel("Reason shown to buyers").fill("The artist is ill");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel event" }).click();
    await expect(page.getByText("This event is cancelled.")).toBeVisible();

    await visitor.goto(`/en${eventPath}`);
    await expect(visitor.getByText("This event has been cancelled")).toBeVisible();
    await expect(visitor.getByText("The artist is ill")).toBeVisible();
    await expect(visitor.getByText("Sales closed")).toBeVisible();
    await visitor.goto(`/en/o/${orgSlug}`);
    await expect(visitor.getByText("This organization has no upcoming events.")).toBeVisible();
  });
});

test("the home page has no accessibility violations with events listed", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Upcoming events" })).toBeVisible();
  await noViolations(page);
});
