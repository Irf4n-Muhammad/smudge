import { test, expect, type Page } from "@playwright/test";
import { openMore } from "./nav";

async function signIn(page: Page) {
  await page.goto("/");
  // The navigation renders before bootstrap establishes the demo session cookie.
  await page.locator(".post-card").first().waitFor();
  await page.evaluate(() =>
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "you" }),
    }),
  );
  await page.reload();
  await expect(page.getByRole("link", { name: "Smudge home" }).first()).toBeVisible();
}

test("a website is imported, tidied and published as a page that opens in the app", async ({
  page,
}) => {
  await signIn(page);
  await openMore(page, "Import a website");
  const start = page.getByRole("dialog", { name: "Import a website" });

  // The permission box has to be ticked before anything is read.
  await start.getByLabel("Website link").fill("http://127.0.0.1:3010/");
  const go = start.getByRole("button", { name: "Import", exact: true });
  await expect(go).toBeDisabled();
  await start.getByText("This is my site, or I have permission to copy it.").click();
  await go.click();

  const editor = page.getByRole("dialog", { name: "Edit your imported page" });
  await expect(editor.getByText("Imported from 127.0.0.1", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(editor.getByText(/We found \d+ words, \d+ photos and 4 products/)).toBeVisible();
  await expect(editor.getByRole("radio", { name: "Shop" })).toHaveAttribute("aria-checked", "true");
  await expect(editor.getByLabel("Product 1 name")).toHaveValue("Sourdough loaf");
  await expect(editor.getByLabel("Product 1 price")).toHaveValue("Rp 45.000");

  // What was read shows in the preview; scripts from the site never come along.
  const preview = editor.locator(".easy-layer.shown iframe").contentFrame();
  await expect(preview.getByRole("list", { name: "Products" })).toContainText("Butter croissant");
  await expect(preview.locator("body")).not.toContainText("tracker");

  await editor.getByLabel("Title").fill("Kopi Senja bakery");
  await editor.getByLabel("Product 4 price").fill("Rp 30.000");
  await editor.getByRole("button", { name: "Remove photo 2" }).click();
  await expect(preview.locator("h1")).toHaveText("Kopi Senja bakery");
  await expect(preview.getByRole("list", { name: "Products" })).toContainText("Rp 30.000");
  await expect(editor.getByText("Draft saved · only you see it")).toBeVisible();
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(editor).toHaveCount(0);

  // In the feed it opens in the pop-up, saying where it came from.
  const post = page.getByRole("article", { name: /Kopi Senja bakery by/ }).first();
  await post.getByRole("button", { name: "See the shop" }).click();
  const sheet = page.getByRole("dialog", { name: "Kopi Senja bakery" });
  await expect(sheet.getByText("Made in Smudge")).toBeVisible();
  await expect(sheet.frameLocator("iframe").locator("h1")).toHaveText("Kopi Senja bakery");
  const original = sheet.getByRole("link", { name: /Visit original site/ });
  await expect(original).toHaveAttribute("href", "http://127.0.0.1:3010/");
  await expect(original).toHaveAttribute("target", "_blank");
  await expect(original).toHaveAttribute("rel", "noopener noreferrer");
});

test("addresses inside the server's network are refused", async ({ page }) => {
  await signIn(page);
  await openMore(page, "Import a website");
  const start = page.getByRole("dialog", { name: "Import a website" });
  await start.getByLabel("Website link").fill("https://127.0.0.1:3001/api/health");
  await start.getByText("This is my site, or I have permission to copy it.").click();
  await start.getByRole("button", { name: "Import", exact: true }).click();
  await expect(start.getByRole("alert")).toHaveText("That address can't be imported.");
});
