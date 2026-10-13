import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { emailLink, grantPlatformAdmin } from "./support/db";
import { PASSWORD, signUp, uniqueId } from "./support/users";

const noViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
};

test.describe("signed-out visitors", () => {
  test("are sent to sign-in and brought back afterwards", async ({ page }) => {
    await page.goto("/en/dashboard");
    await expect(page).toHaveURL(/\/en\/sign-in\?returnUrl=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("see a clear error for wrong credentials", async ({ page }) => {
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Wrong email or password." }),
    ).toBeVisible();
  });

  test("get field errors in their language before anything is sent", async ({ page }) => {
    await page.goto("/fi/sign-up");
    await page.getByRole("button", { name: "Luo tili" }).click();
    await expect(page.getByText("Anna kelvollinen sähköpostiosoite.")).toBeVisible();
    await expect(page.getByText("Käytä vähintään 10 merkkiä.")).toBeVisible();
    await expect(page.getByLabel("Sähköposti")).toHaveAttribute("aria-invalid", "true");
  });

  for (const path of ["/en/sign-in", "/en/sign-up", "/en/forgot-password"]) {
    test(`${path} has no accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await noViolations(page);
    });
  }
});

test("an organization goes from registration to approval and gains door staff", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run of the full journey is enough");
  test.setTimeout(120_000);
  const orgName = `Tiyatro Örnek ${uniqueId()}`;
  const slug = `tiyatro-ornek-${orgName.slice(-8)}`;

  const owner = await signUp(browser, "Olga Owner");

  await test.step("the owner registers the organization and sees it is pending", async () => {
    const { page } = owner;
    await expect(page.getByText("You are not part of an organization yet")).toBeVisible();
    await page.getByRole("link", { name: "Register an organization" }).click();
    await page.getByLabel("Organization name").fill(orgName);
    // The address follows the name, with Turkish letters transliterated.
    await expect(page.getByLabel("Web address")).toHaveValue(slug);
    await expect(page.getByLabel("Contact email")).toHaveValue(owner.email);
    await noViolations(page);

    await page.getByRole("button", { name: "Register organization" }).click();
    await expect(page.getByText("Choose a country.")).toBeVisible();
    await page.getByLabel("Country").selectOption("FI");
    await page.getByRole("button", { name: "Register organization" }).click();

    await expect(page).toHaveURL(new RegExp(`/en/dashboard/${slug}$`));
    await expect(page.getByText("Waiting for approval")).toBeVisible();
    await noViolations(page);
  });

  await test.step("the address cannot be registered twice", async () => {
    const { page } = owner;
    await page.goto("/en/dashboard/new");
    await page.getByLabel("Organization name").fill("Another");
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("Country").selectOption("FI");
    await page.getByRole("button", { name: "Register organization" }).click();
    await expect(page.getByText("This address is already in use.")).toBeVisible();
  });

  const outsider = await signUp(browser, "Oskar Outsider");

  await test.step("other users cannot see the organization or the admin area", async () => {
    const response = await outsider.page.goto(`/en/dashboard/${slug}`);
    expect(response?.status()).toBe(404);
    expect((await outsider.page.goto("/en/admin/organizations"))?.status()).toBe(404);
    expect((await owner.page.goto("/en/admin/organizations"))?.status()).toBe(404);
  });

  const admin = await signUp(browser, "Petra Platform");
  await grantPlatformAdmin(admin.email);

  await test.step("a platform admin approves it with a note", async () => {
    const { page } = admin;
    await page.goto("/en/admin/organizations");
    const card = page.getByRole("listitem").filter({ hasText: orgName });
    await expect(card).toContainText(owner.email);
    await noViolations(page);

    await card.getByLabel("Note to the organization").fill("Welcome aboard");
    await card.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: orgName })).toHaveCount(0);

    await page.goto("/en/admin/organizations?status=approved");
    await expect(page.getByRole("listitem").filter({ hasText: orgName })).toContainText(
      "Last note: Welcome aboard",
    );
  });

  await test.step("the owner is told and the pending banner is gone", async () => {
    expect(await emailLink(owner.email, "orgApproved")).toContain(`/en/dashboard/${slug}`);
    await owner.page.goto(`/en/dashboard/${slug}`);
    await expect(owner.page.getByText("Waiting for approval")).toHaveCount(0);
    await expect(owner.page.getByText("Approved").first()).toBeVisible();
  });

  const door = await signUp(browser, "Dan Door");

  await test.step("the owner invites door staff", async () => {
    const { page } = owner;
    await page.getByRole("link", { name: "Members" }).click();
    await page.getByLabel("Email").fill(door.email);
    await page.getByLabel("Role", { exact: true }).selectOption("door_staff");
    await expect(page.getByText("Door staff can only scan tickets at the door.")).toBeVisible();
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText(`Invitation sent to ${door.email}.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pending invitations" })).toBeVisible();
    await noViolations(page);
  });

  await test.step("someone else cannot use the invitation link", async () => {
    await outsider.page.goto(await emailLink(door.email, "orgInvitation"));
    await expect(outsider.page.getByText("This invitation is not available")).toBeVisible();
  });

  await test.step("the invitee accepts and gets door-staff access only", async () => {
    const { page } = door;
    await page.goto(await emailLink(door.email, "orgInvitation"));
    await expect(page.getByRole("heading", { name: `Join ${orgName}` })).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation" }).click();

    await expect(page).toHaveURL(new RegExp(`/en/dashboard/${slug}$`));
    await expect(page.getByText("Door staff").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    expect((await page.goto(`/en/dashboard/${slug}/members`))?.status()).toBe(404);
    expect((await page.goto(`/en/dashboard/${slug}/settings`))?.status()).toBe(404);
  });

  await test.step("the owner sees the new member and can remove them", async () => {
    const { page } = owner;
    await page.reload();
    const row = page.getByRole("row").filter({ hasText: door.email });
    await expect(row).toBeVisible();
    await expect(page.getByText("An organization needs at least one admin.")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: /Remove/ }).click();
    await expect(page.getByRole("row").filter({ hasText: door.email })).toHaveCount(0);

    // Their session is still valid, but the organization is gone for them at once.
    expect((await door.page.goto(`/en/dashboard/${slug}`))?.status()).toBe(404);
  });

  await test.step("signing out and back in returns to the dashboard", async () => {
    const { page } = owner;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await page.goto(`/en/dashboard/${slug}`);
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/dashboard/${slug}$`));
  });
});
