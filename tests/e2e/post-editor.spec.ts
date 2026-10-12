import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

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

test("a post is made by picking a style and tapping its parts, then published", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("button", { name: "Create a post" })
    .filter({ visible: true })
    .first()
    .click();
  const pick = page.getByRole("dialog", { name: "Pick a post style" });
  await expect(pick.getByRole("option", { name: "Poster" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await pick.getByRole("button", { name: "Use this style" }).click();

  const editor = page.getByRole("dialog", { name: "Edit your post" });
  const frame = editor.locator(".easy-layer.shown iframe").contentFrame();
  await expect(frame.locator("h1")).toContainText("The city glows after rain");

  // Photos: the first one becomes the cover.
  await editor.getByRole("button", { name: "Photos", exact: true }).click();
  await editor
    .getByLabel("Add photos")
    .setInputFiles([resolve("assets/demo/coast.jpg"), resolve("assets/demo/lake.jpg")]);
  await expect(editor.getByRole("button", { name: "Edit photo 2" })).toBeVisible();
  await expect(frame.locator(".hero img")).toHaveCount(1);

  // Tapping the headline in the preview opens it for editing.
  await frame.locator("h1").click();
  const headline = editor.getByRole("region", { name: "Headline" });
  await headline.getByRole("textbox").fill("Summer by the *water*");
  await expect(frame.locator("h1 em")).toHaveText("water");
  await expect(editor.getByText("Draft saved · only you see it")).toBeVisible();

  await frame.locator("figure img").first().click({ force: true });
  const photo = editor.getByRole("region", { name: "Photo 1" });
  await photo.getByLabel("Caption").fill("First swim <b>of the year</b>");

  // Switching style keeps the words and photos.
  await editor.getByRole("button", { name: "Style", exact: true }).click();
  await editor.getByRole("radio", { name: "Magazine" }).click();
  await expect(frame.locator(".mast")).toBeVisible();
  await expect(frame.locator("h1")).toContainText("Summer by the water");
  await expect(frame.locator("figcaption").first()).toHaveText("First swim <b>of the year</b>");

  await editor.getByRole("button", { name: "Button", exact: true }).click();
  await editor
    .getByRole("region", { name: "Button & caption" })
    .getByRole("textbox")
    .first()
    .fill("Lake days.");
  await editor
    .getByRole("region", { name: "Button & caption" })
    .getByRole("textbox")
    .nth(1)
    .fill("Read the story");
  await expect(editor.getByText("Draft saved · only you see it")).toBeVisible();
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(editor).toHaveCount(0);

  const post = page.getByRole("article", { name: /Summer by the water by/ }).first();
  await expect(post).toContainText("Lake days.");
  await post.getByRole("button", { name: "Read the story" }).click();
  const sheet = page.getByRole("dialog", { name: "Summer by the water" });
  await expect(sheet.frameLocator("iframe").locator("h1")).toContainText("Summer by the water");
});
