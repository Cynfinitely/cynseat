import { randomBytes } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { emailLink } from "./db";

export const PASSWORD = "correct-horse-battery";

export type E2EUser = { name: string; email: string; page: Page };

export const uniqueId = (): string => randomBytes(4).toString("hex");

/** Signs a new user up through the UI in their own browser context and confirms their email. */
export async function signUp(browser: Browser, name: string): Promise<E2EUser> {
  const email = `${name.toLowerCase().replace(/\W+/g, "-")}-${uniqueId()}@example.com`;
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/en/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  await page.goto(await emailLink(email, "verifyEmail"));
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();

  return { name, email, page };
}

/** Registers an organization through the UI for an already signed-in user. */
export async function registerOrganization(page: Page, name: string): Promise<string> {
  await page.goto("/en/dashboard/new");
  await page.getByLabel("Organization name").fill(name);
  await page.getByLabel("Country").selectOption("FI");
  const slug = await page.getByLabel("Web address").inputValue();
  await page.getByRole("button", { name: "Register organization" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/dashboard/${slug}$`));
  return slug;
}
