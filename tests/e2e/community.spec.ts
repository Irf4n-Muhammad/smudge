import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const toast = (page: Page, text: string) =>
  expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();

// One new member and Alex (the demo moderator) use every community surface. The report is
// dismissed rather than removed so the shared E2E data keeps its seeded posts.
test("find people, follow, notify, message, report, moderate, block and delete an account", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const handle = "pal" + Date.now().toString(36);
  const name = `Pal ${handle}`;
  await page.getByRole("button", { name: "Create an account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Handle").fill(handle);
  await dialog.getByLabel("Email", { exact: true }).fill(`${handle}@mail.example`);
  await dialog.getByLabel("Password").fill("a long enough phrase");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your chapters" })).toBeVisible();

  // Search ranks the handle match first; following is one tap.
  await page.getByRole("button", { name: "Find people", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Find people" })).toBeVisible();
  await page.getByLabel("Search people").fill("alex");
  await page.getByRole("button", { name: "Follow Alex Morgan" }).click();
  await expect(page.getByRole("button", { name: "Unfollow Alex Morgan" })).toBeVisible();

  // Report a post with a reason.
  await page.getByRole("button", { name: "Your feed" }).click();
  const options = page
    .locator(".post-card")
    .first()
    .getByRole("button", { name: /^Options for / });
  const title = (await options.getAttribute("aria-label"))!.replace("Options for ", "");
  await options.click();
  await page.getByRole("button", { name: "Report post" }).click();
  await dialog.getByLabel("Something else").check();
  await dialog.getByRole("button", { name: "Send report" }).click();
  await toast(page, "A moderator will review this post");

  // Alex sees the follow as a notification, can now write, and reviews the report.
  await page.getByLabel("Preview as demo account").selectOption("you");
  await toast(page, "Now viewing");
  await page.getByRole("button", { name: /^Notifications \(\d+ new\)$/ }).click();
  await expect(
    page.locator(".notification").filter({ hasText: `${name} started following you.` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Find people", exact: true }).click();
  await page.getByLabel("Search people").fill(handle);
  await page.getByRole("button", { name: `Message ${name}` }).click();
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await page.getByLabel("Write a message").fill("Welcome to Forma!");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".bubble.mine").filter({ hasText: "Welcome to Forma!" })).toBeVisible();

  await page.getByRole("button", { name: "Moderation", exact: true }).click();
  const report = page.locator(".report-item").filter({ hasText: title });
  await expect(report).toContainText("other ×1");
  await report.getByRole("button", { name: "Dismiss" }).click();
  await toast(page, "Reports dismissed");
  await expect(page.locator(".report-item").filter({ hasText: title })).toHaveCount(0);

  // Back as the new member: an unread message, a reply, then a block.
  await page.getByLabel("Preview as demo account").selectOption({ label: name });
  await toast(page, "Now viewing");
  await page.getByRole("button", { name: "Messages (1 new)" }).click();
  await page.getByRole("button", { name: /Alex Morgan/ }).click();
  await expect(page.locator(".bubble").filter({ hasText: "Welcome to Forma!" })).toBeVisible();
  await page.getByLabel("Write a message").fill("Thanks!");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".bubble.mine").filter({ hasText: "Thanks!" })).toBeVisible();

  await page.getByRole("button", { name: "Find people", exact: true }).click();
  await page.getByLabel("Search people").fill("alex");
  await page.getByRole("button", { name: "Block Alex Morgan" }).click();
  await toast(page, "Blocked @alex");
  await expect(page.getByRole("button", { name: "Block Alex Morgan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Account settings" }).click();
  await expect(
    page.locator(".identity-panel").filter({ hasText: "Blocked accounts" }),
  ).toContainText("Alex Morgan");

  // Deleting the account needs the password and signs out.
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Your password").fill("wrong phrase entirely");
  await page.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.locator(".danger-zone").getByRole("alert")).toHaveText(
    "That password is not right.",
  );
  await page.getByLabel("Your password").fill("a long enough phrase");
  await page.getByRole("button", { name: "Delete forever" }).click();
  await toast(page, "Your account was deleted");
  const search = await page.request.get(`/api/people?q=${handle}`);
  expect(((await search.json()) as unknown[]).length).toBe(0);
});

test("mobile: the bottom bar reaches explore, people, notifications and messages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await nav.getByRole("button", { name: "Explore" }).click();
  await expect(page.getByRole("heading", { name: "Wander a little further." })).toBeVisible();
  await page.getByRole("button", { name: "Looking for someone? Find people" }).click();
  await expect(page.getByRole("heading", { name: "Find people" })).toBeVisible();
  await nav.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await nav.getByRole("button", { name: /^Messages/ }).click();
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await nav.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Moderation" }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
