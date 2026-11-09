import { test, expect } from "@playwright/test";

test("websites post as brands, media and places, and stay a small part of the feed", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  // Alex follows Lumen Coffee: its post is in the feed, marked as a place, with something to do.
  const lumen = page.getByRole("article", { name: /by Lumen Coffee$/ });
  await expect(lumen).toHaveCount(1);
  await expect(lumen.locator(".site-badge")).toHaveText("Place");
  await expect(lumen.getByRole("button", { name: "Reserve a bag" })).toBeVisible();
  // Alex doesn't follow Northline, but Maya and Leo saved its drop, so it rises.
  const northline = page.getByRole("article", { name: /by Northline$/ });
  await expect(northline).toHaveCount(1);
  await expect(northline.locator(".site-badge")).toHaveText("Brand");
  await expect(northline).toContainText("Rising with people");
  // Nobody brought The Weekender, so it stays out of the feed.
  await expect(page.getByRole("article", { name: /by The Weekender$/ })).toHaveCount(0);
});
