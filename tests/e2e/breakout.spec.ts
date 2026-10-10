import { test, expect } from "@playwright/test";

test("scroll feed permits bounded cross-post artwork without blocking the next post", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mode=breakout");
  await expect(page.locator(".break-post")).toHaveCount(3);
  const core = page.locator(".break-1 .break-core");
  await core.scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const first = box(".break-0 .break-core"),
      next = box(".break-1 .break-core"),
      extension = box(".break-0 .break-extension"),
      ship = box(".cross-ship");
    return {
      downward: extension.bottom > next.top,
      upward: ship.top < first.bottom,
      bounded:
        getComputedStyle(document.querySelector(".break-0 .break-extension")!).overflow === "clip",
      clickThrough:
        getComputedStyle(document.querySelector(".cross-web")!).pointerEvents === "none",
    };
  });
  expect(geometry).toEqual({ downward: true, upward: true, bounded: true, clickThrough: true });
  await page.getByRole("button", { name: "Fire thrusters" }).click();
  await expect(page.locator(".breakout-feed")).toHaveClass(/engines-on/);
  await page.getByRole("button", { name: "GIVE ME A PUSH" }).click();
  await expect(page.locator(".web-hero")).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "Show boundaries" }).click();
  await expect(page.getByRole("status")).toContainText("actual extension limit");
  await page.getByRole("button", { name: "Switch to night mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await core.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/breakout-boundaries-night.png",
    animations: "disabled",
  });
  const like = page.locator(".break-1").getByRole("button", { name: /^(Like|Unlike) / });
  const before = await like.getAttribute("aria-pressed");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
  await page.locator(".break-1").getByRole("button", { name: "Open story" }).click();
  await expect(page.getByRole("dialog").locator(".runtime")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Hide boundaries" }).click();
  await page.getByRole("button", { name: "Switch to day mode" }).click();
  await page.locator(".break-0 .break-social").scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 150);
  await page.screenshot({ path: "artifacts/breakout-tested.png", animations: "disabled" });
});

test("mobile breakout remains a vertical scroll feed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=breakout");
  await page.getByRole("button", { name: "Fire thrusters" }).click();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".break-2").getByRole("button", { name: "Open story" }).click();
  await expect(page.getByRole("dialog").locator(".runtime")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Back to your feed" }).click();
  await expect(page.getByRole("button", { name: "Break the frame" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
