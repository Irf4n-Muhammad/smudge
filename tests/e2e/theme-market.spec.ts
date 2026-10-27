import { test, expect } from "@playwright/test";
import { openMore, openPeople, pickFeed } from "./nav";

test("a designer sends an HTML/CSS theme, a moderator approves it, and it is worn in the feed", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const name = "Hello tag " + Date.now().toString(36).slice(-4);

  await openMore(page, "Themes");
  // Designing is a separate page; people who only pick a theme never see code.
  await expect(page.getByRole("region", { name: "Make a theme" })).toHaveCount(0);
  await page.getByRole("button", { name: "Send your own theme" }).click();
  const studio = page.getByRole("region", { name: "Make a theme" });
  await studio.getByLabel("Name", { exact: true }).fill(name);
  // Code that cannot work in a theme is refused before it is sent.
  const html = studio.getByLabel("Piece 1 HTML");
  const starter = await html.inputValue();
  await html.fill('<div onclick="steal()">hi</div>');
  await expect(studio.getByRole("alert")).toContainText("Event handlers");
  await expect(studio.getByRole("button", { name: "Send for review" })).toBeDisabled();
  await html.fill(starter);
  // The live preview draws the piece as an image, the same way the feed will.
  await expect(studio.locator(".theme-piece-art")).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await studio.getByRole("button", { name: "Send for review" }).click();
  await expect(page.locator(".toast")).toContainText("Sent for review");
  await expect(studio.getByRole("listitem", { name: `Design ${name}` })).toContainText(
    "Waiting for review",
  );
  // Not in the market until someone approves it.
  await expect(page.getByRole("article", { name: `Theme ${name}` })).toHaveCount(0);

  await openMore(page, "Moderation");
  const review = page.getByRole("listitem", { name: `Review ${name}` });
  await review.getByText("Code").click();
  await expect(review.locator(".theme-code")).toContainText("hello!");
  await review.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(".toast")).toContainText("Approved");

  await openMore(page, "Themes");
  const card = page.getByRole("article", { name: `Theme ${name}` });
  await card.getByRole("button", { name: `Preview ${name}` }).click();
  await page.getByRole("dialog", { name }).getByRole("button", { name: /^Wear/ }).click();
  await page.keyboard.press("Escape");
  await expect(card).toContainText("Wearing it");

  await page.goto("/");
  const post = page
    .locator(".post-card")
    .filter({ has: page.locator(".decor-credit", { hasText: `Theme ${name}` }) })
    .first();
  const art = post.locator(".decor-piece .theme-piece-art");
  await expect(art).toHaveAttribute("src", /^data:image\/svg\+xml/);
  // The designer's markup is never part of the page itself, only the image drawn from it.
  await expect(post.locator(".decor-piece .tag")).toHaveCount(0);
  await expect
    .poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(140);
});
