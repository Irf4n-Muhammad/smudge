import { test, expect } from "@playwright/test";
import { openMore, openPeople, pickFeed } from "./nav";

test("sign up with email and password, confirm the email, log out and back in, change password", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const handle = "acct" + Date.now().toString(36);
  const email = `${handle}@mail.example`;
  await page.getByRole("button", { name: "Create an account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Account Tester");
  await dialog.getByLabel("Username").fill(handle);
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill("short");
  await dialog.getByLabel("Repeat password").fill("short");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  // The browser blocks a too-short password before it reaches the server.
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Password", { exact: true }).fill("a long enough phrase");
  await dialog.getByLabel("Repeat password").fill("a long enough phrase");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  // New accounts land on the feed with a short welcome: a photo and a few people to follow.
  await page
    .getByRole("dialog", { name: /^Welcome/ })
    .getByRole("button", { name: "Skip for now" })
    .click();

  const banner = page.locator(".verify-banner");
  await expect(banner).toContainText(email);
  // The demo's stand-in mailbox lives on the Who you are page.
  await openMore(page, "Who you are");
  const inbox = page.getByLabel("Local demo inbox");
  await expect(inbox).toContainText("Confirm this address");
  const token = (await inbox.innerText()).match(/verify=([A-Za-z0-9_-]{43})/)![1]!;
  await page.goto(`/?verify=${token}`);
  await expect(page.getByRole("status").filter({ hasText: "Email confirmed" })).toBeVisible();
  await expect(page.locator(".verify-banner")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await openMore(page, "Account settings");
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.locator(".account-panel")).toContainText(email);
  await expect(page.locator(".account-panel")).toContainText("Confirmed");
  await page.getByLabel("Current password").fill("a long enough phrase");
  await page.getByLabel("New password").fill("an even longer phrase");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password changed" })).toBeVisible();

  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "You are logged out" })).toBeVisible();

  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await dialog.getByLabel("Email or username").fill(handle);
  await dialog.getByLabel("Password", { exact: true }).fill("a long enough phrase");
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("That email or password is not right.");
  await dialog.getByLabel("Password", { exact: true }).fill("an even longer phrase");
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openMore(page, "Account settings");
  await expect(page.locator(".account-panel")).toContainText(email);
});
