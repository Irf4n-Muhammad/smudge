import { test, expect } from "@playwright/test";

test("the feed scrolls freely like Instagram: even 4:5 windows, and a swipe over a post scrolls the feed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const windows = page.locator(".post-list > .post-card .runtime");
  await windows.first().waitFor();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe(
    "none",
  );
  for (let i = 0; i < 3; i++) {
    const box = (await windows.nth(i).boundingBox())!;
    expect(Math.abs(box.height / box.width - 1.25)).toBeLessThan(0.02);
  }
  // Wait until the first post has opened, then scroll with the pointer over its frame.
  await expect(windows.first()).toHaveAttribute("data-ready", "true");
  const inside = page.frameLocator(".post-list > .post-card .runtime iframe").first();
  await expect(inside.locator("html")).toHaveCSS("overflow-y", "hidden");
  // The feed settles (more posts arrive) before the scroll is measured.
  await page.waitForLoadState("networkidle");
  const frame = (await windows.first().boundingBox())!;
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  const before = await page.evaluate(() => scrollY);
  // A wheel sent while a frame is still being swapped in can be dropped, so retry the gesture;
  // the post's own page must never take the scroll, whichever attempt lands.
  await expect(async () => {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(before + 300);
  }).toPass({ timeout: 15000 });
  await expect
    .poll(() => inside.locator("html").evaluate(() => document.scrollingElement!.scrollTop))
    .toBe(0);
  // Posts ahead are already open, not waiting to load.
  await expect(windows.nth(1)).toHaveAttribute("data-ready", "true");
});
