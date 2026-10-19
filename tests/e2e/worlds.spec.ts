import { test, expect } from "@playwright/test";
import { switchAppearance } from "./nav";

test("worlds support rearranging memories, stars, letters and persistent night mode", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  const keepsakes = page.getByRole("article", { name: "A beautiful little mess by Maya Chen" });
  await keepsakes.scrollIntoViewIfNeeded();
  const room = keepsakes.frameLocator("iframe");
  const photo = room.getByRole("button", { name: "Move or open the coast memory" });
  await expect(photo).toBeVisible();
  await photo.focus();
  const before = Number(
    await photo.evaluate(
      (el) => parseFloat((el as HTMLElement).style.getPropertyValue("--dx")) || 0,
    ),
  );
  const write = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/capability") &&
      r.request().postDataJSON()?.request?.method === "viewer.progress.write",
  );
  await photo.press(before >= 65 ? "ArrowLeft" : "ArrowRight");
  await write;
  const offset = await photo.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--dx"));
  await photo.click();
  await expect(room.locator("#memory")).toHaveClass(/open/);
  await room.getByRole("button", { name: "Tuck it away ↙" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await switchAppearance(page, "Switch to night mode");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await keepsakes.scrollIntoViewIfNeeded();
  await expect(room.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(keepsakes).toHaveCSS("background-color", "rgb(32, 37, 31)");
  await expect(keepsakes.locator("iframe")).toHaveCSS("color-scheme", "normal");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await keepsakes.scrollIntoViewIfNeeded();
  await expect
    .poll(() => photo.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--dx")))
    .toBe(offset);
  await page.evaluate(() => window.scrollTo(0, 0));
  const sky = page.getByRole("article", { name: "Somewhere between midnights by Leo Park" });
  await sky.scrollIntoViewIfNeeded();
  await sky.frameLocator("iframe").getByRole("button", { name: "Open Tuesday's memory" }).click();
  await expect(
    sky.frameLocator("iframe").getByRole("heading", { name: "Someone was still awake." }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("textbox", { name: "Search posts" }).fill("A letter for slower days");
  const letter = page.getByRole("article", { name: "A letter for slower days by Inès Laurent" });
  await letter.scrollIntoViewIfNeeded();
  const envelope = letter.frameLocator("iframe"),
    open = envelope.locator("#open");
  if ((await open.getAttribute("aria-expanded")) === "true") await open.click();
  await open.click();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  await expect(envelope.getByText("There is no prize for becoming yourself faster.")).toBeVisible();
  await letter.screenshot({ path: "artifacts/letter-night.png", animations: "disabled" });
});

test("mobile worlds and night studio remain navigable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const room = page.getByRole("article", { name: "A beautiful little mess by Maya Chen" });
  await room.scrollIntoViewIfNeeded();
  await expect(room.locator(".runtime")).toHaveAttribute("data-ready", "true");
  await expect(room.frameLocator("iframe").locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await room.screenshot({ path: "artifacts/world-mobile-night.png", animations: "disabled" });
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Create a post" })
    .click();
  // On a phone the studio is one tap inside the post editor.
  await page.getByRole("button", { name: "Open the studio" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The night paper of the gallery look (#09090c).
  await expect(dialog).toHaveCSS("background-color", "rgb(9, 9, 12)");
  await page.screenshot({ path: "artifacts/studio-mobile-night.png", animations: "disabled" });
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await switchAppearance(page, "Switch to day mode");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
