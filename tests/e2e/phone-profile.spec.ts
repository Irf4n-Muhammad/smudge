import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("on a phone, your profile keeps posts from every side and its ☰ opens what it lists", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  // Browse Runners: Alex's Everyday breakfast is not in this feed, but it is still his post.
  await page
    .getByRole("button", { name: /Runners/ })
    .first()
    .click();
  await expect(page.locator(".side-home")).toBeVisible();
  await dock.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.locator(".profile-default-count")).not.toHaveText("0 posts");
  await page
    .getByRole("button", { name: /Breakfast is the best meal/ })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Breakfast is the best meal" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The ☰ menu's composers open on the profile, and the menu gets out of the way.
  const menu = page.locator("details.profile-more").first();
  for (const [item, dialog] of [
    ["Share a milestone", page.getByRole("dialog", { name: "Share a milestone" })],
    ["Import a website", page.getByRole("heading", { name: /Bring your/ })],
  ] as const) {
    await page.getByLabel("More options", { exact: true }).first().click();
    await page.getByRole("group", { name: "More" }).getByRole("button", { name: item }).click();
    await expect(dialog).toBeVisible();
    await expect(menu).not.toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  // Back to Everyday, so later specs see the feed they expect.
  await page.evaluate(() =>
    fetch("/api/sides/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side: "everyday" }),
    }),
  );
});
