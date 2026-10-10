import { test, expect } from "@playwright/test";

test("cockpit orbit selects real posts, opens isolated worlds and persists social actions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Enter hyperspace" }).click();
  await expect(page).toHaveURL(/mode=cockpit/);
  const dial = page.getByRole("slider", { name: "Rotate post orbit" });
  await expect(dial).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume ambient motion" })).toBeVisible();
  const first = await dial.getAttribute("aria-valuetext");
  await dial.focus();
  await dial.press("ArrowRight");
  await expect(dial).toHaveAttribute("aria-valuenow", "2");
  await expect(dial).not.toHaveAttribute("aria-valuetext", first!);
  await page.getByRole("button", { name: "Previous transmission" }).click();
  await expect(dial).toHaveAttribute("aria-valuetext", first!);
  const box = (await dial.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(dial).not.toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "Select A beautiful little mess", exact: true }).click();
  await page.getByRole("button", { name: "Enter this world" }).click();
  const hologram = page.getByRole("dialog");
  await expect(hologram.locator(".runtime")).toHaveAttribute("data-ready", "true");
  await expect(hologram.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts allow-forms");
  await hologram
    .frameLocator("iframe")
    .getByRole("button", { name: "Move or open the coast memory" })
    .click();
  await expect(hologram.frameLocator("iframe").locator("#memory")).toHaveClass(/open/);
  await page.screenshot({ path: "artifacts/cockpit-hologram.png", animations: "disabled" });
  await hologram.getByRole("button", { name: "Close dialog" }).click();
  const like = page.getByRole("button", { name: /^(Like|Unlike) transmission$/ });
  const before = await like.getAttribute("aria-pressed");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
  await page.getByRole("button", { name: "Open transmission comments" }).click();
  const message = `Signal received ${Date.now()}`;
  await page.getByLabel("YOUR TRANSMISSION", { exact: true }).fill(message);
  await page.getByRole("button", { name: "Send transmission" }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/cockpit-comments.png", animations: "disabled" });
  await page.reload();
  await page.getByRole("button", { name: "Select A beautiful little mess", exact: true }).click();
  await expect(like).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
  await page.getByRole("button", { name: "Open transmission comments" }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close transmission comments" }).click();
  await page.screenshot({ path: "artifacts/cockpit-desktop.png", animations: "disabled" });
  await page.getByRole("button", { name: "Back to feed" }).click();
  await expect(page.getByRole("button", { name: "For you", exact: true })).toBeVisible();
});

test("mobile cockpit keeps navigation and transmission controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mode=cockpit");
  await page.getByRole("button", { name: "Next transmission" }).click();
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open transmission comments" }).click();
  await expect(page.getByLabel("YOUR TRANSMISSION", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close transmission comments" }).click();
  await page.screenshot({
    path: "artifacts/cockpit-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Back to feed" }).click();
  await expect(page.getByRole("button", { name: "Enter hyperspace" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
