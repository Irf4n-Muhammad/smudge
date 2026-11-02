import { test, expect } from "@playwright/test";

test("only the feed post in focus runs; the rest hold still until they come into focus", async ({
  page,
}) => {
  await page.goto("/");
  const windows = page.locator(".post-card .world-window .runtime");
  await expect(windows.nth(2)).toBeAttached();
  await expect(page.locator('.post-card .runtime[data-ready="true"]').first()).toBeVisible();
  // One post runs at a time, however many are mounted.
  await expect(page.locator('.post-card .runtime[data-live="true"]')).toHaveCount(1);

  const second = windows.nth(1);
  await second.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(second).toHaveAttribute("data-live", "true");
  await expect(windows.first()).toHaveAttribute("data-live", "false");
  await expect(page.locator('.post-card .runtime[data-live="true"]')).toHaveCount(1);

  // The post out of focus was told to hold still: its timers wait and animations pause.
  const first = windows.first().locator("iframe").contentFrame();
  await expect(first.locator("html")).toHaveAttribute("data-active", "off");
  const focused = second.locator("iframe").contentFrame();
  await expect(focused.locator("html")).not.toHaveAttribute("data-active", "off");
  expect(await focused.locator("html").evaluate(() => (window as any).forma.active)).toBe(true);
});
