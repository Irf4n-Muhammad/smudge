import { test, expect } from "@playwright/test";

test("sign up with email and password, confirm the email, log out and back in, change password", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const handle = "acct" + Date.now().toString(36);
  const email = `${handle}@mail.example`;
  await page.getByRole("button", { name: "Create an account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Account Tester");
  await dialog.getByLabel("Handle").fill(handle);
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Password").fill("short");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  // The browser blocks a too-short password before it reaches the server.
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Password").fill("a long enough phrase");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your chapters" })).toBeVisible();

  const banner = page.locator(".verify-banner");
  await expect(banner).toContainText(email);
  const inbox = page.getByLabel("Local demo inbox");
  await expect(inbox).toContainText("Confirm this address");
  const token = (await inbox.innerText()).match(/verify=([A-Za-z0-9_-]{43})/)![1]!;
  await page.goto(`/?verify=${token}`);
  await expect(page.getByRole("status").filter({ hasText: "Email confirmed" })).toBeVisible();
  await expect(page.locator(".verify-banner")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Account settings" }).click();
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
  await dialog.getByLabel("Email or handle").fill(handle);
  await dialog.getByLabel("Password").fill("a long enough phrase");
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("That email or password is not right.");
  await dialog.getByLabel("Password").fill("an even longer phrase");
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Account settings" }).click();
  await expect(page.locator(".account-panel")).toContainText(email);
});
