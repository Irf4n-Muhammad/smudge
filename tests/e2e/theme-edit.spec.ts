import { test, expect } from "@playwright/test";
import { openMore, openPeople, pickFeed } from "./nav";

test("wear someone's theme, drag a piece and rewrite its text, and the feed wears your version", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await openMore(page, "Themes");
  const card = page.getByRole("article", { name: "Theme Neon open late" });
  await card.getByRole("button", { name: "Preview Neon open late" }).click();
  const preview = page.getByRole("dialog", { name: "Neon open late" });
  // Already wearing it when this test runs twice against the same data.
  const wear = preview.getByRole("button", { name: /^Wear/ });
  if (await wear.count()) await wear.click();
  await preview.getByRole("button", { name: "Edit", exact: true }).click();

  const editor = page.getByRole("dialog", { name: "Edit Neon open late" });
  await editor.getByLabel(/^Text/).fill("Alex's place");
  // Arrow keys move a piece the same way dragging does; it may not leave the edge band.
  const piece = editor.getByRole("button", { name: "Move piece 1" });
  await piece.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowDown");
  await expect(piece).toHaveCSS("left", "22px");
  // The sign is 64px tall: a fifth step would put it 114px into the post, past the 110px band,
  // so it stops after the fourth.
  await expect(piece).toHaveCSS("top", "30px");
  // A real pointer drag moves the star along the bottom edge.
  const star = editor.getByRole("button", { name: "Move piece 2" });
  const box = (await star.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await star.boundingBox())!.x - box.x)).toBe(-60);
  await editor.getByRole("button", { name: "Save my version" }).click();
  await expect(page.locator(".toast")).toContainText("Saved");

  await page.goto("/");
  const post = page
    .locator(".post-card")
    .filter({ has: page.locator(".decor-credit", { hasText: "Theme Neon open late" }) })
    .first();
  const sign = post.locator(".decor-piece").first();
  await expect(sign).toHaveCSS("left", "22px");
  const src = await sign.locator(".theme-piece-art").getAttribute("src");
  expect(decodeURIComponent(src!)).toContain("Alex's place");
  expect(decodeURIComponent(src!)).not.toContain("open late");
});
