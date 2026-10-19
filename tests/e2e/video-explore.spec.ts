import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function signIn(page: Page) {
  await page.goto("/");
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

test("a video added in the post editor plays in the feed, with a poster frame", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("button", { name: "Create a post" })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Pick a post style" })
    .getByRole("button", { name: "Use this style" })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit your post" });
  await editor.getByRole("button", { name: "Photos", exact: true }).click();
  await editor
    .getByLabel("Add photos or videos")
    .setInputFiles(resolve("tests/fixtures/clip.webm"));
  await expect(editor.getByRole("button", { name: "Edit video 1" })).toBeVisible();
  const preview = editor.locator(".easy-layer.shown iframe").contentFrame();
  await expect(preview.locator(".hero video[data-background]")).toHaveCount(1);

  await preview.locator("h1").click();
  await editor
    .getByRole("region", { name: "Headline" })
    .getByRole("textbox")
    .fill("Rain on the window");
  await expect(editor.getByText("Draft saved · only you see it")).toBeVisible();
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(editor).toHaveCount(0);

  const post = page.getByRole("article", { name: /Rain on the window by/ }).first();
  const video = post.locator("iframe").contentFrame().locator("video");
  await expect(video).toHaveAttribute("src", /\/media\/[a-f0-9]{64}\/[a-f0-9-]{36}$/);
  await expect(video).toHaveAttribute("poster", /^data:image\/jpeg;base64,/);
  // The runtime streams it: metadata loads, so the browser could play it.
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15000 })
    .toBeGreaterThan(0);

  // Wrong files are refused with a plain message.
  const refused = await page.evaluate(() =>
    fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
    }).then((r) => r.json()),
  );
  expect(refused.error).toBe("INVALID_VIDEO");
});

test("explore shows people you don't follow and searches every post", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Search" }).filter({ visible: true }).first().click();
  await expect(page.getByRole("searchbox", { name: "Search all posts" })).toBeVisible();
  const following = await page.evaluate(() =>
    fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((b: { following: string[] }) => b.following),
  );
  const cards = page.locator(".post-card");
  await expect(cards.first()).toBeVisible();
  const shown = await page.evaluate(() =>
    fetch("/api/explore")
      .then((r) => r.json())
      .then((posts: { ownerId: string; moment?: unknown }[]) => posts),
  );
  expect(shown.length).toBeGreaterThan(0);
  for (const p of shown) {
    expect(p.ownerId).not.toBe("you");
    expect(following).not.toContain(p.ownerId);
    expect(p.moment).toBeUndefined();
  }

  const search = page.getByRole("searchbox", { name: "Search all posts" });
  await search.fill("zzzz nothing here");
  await expect(page.getByRole("heading", { name: "Nothing matches that yet." })).toBeVisible();
  const any = (
    await page.evaluate(() =>
      fetch("/api/feed")
        .then((r) => r.json())
        .then((posts: { metadata: { title: string }; moment?: unknown }[]) =>
          posts.filter((p) => !p.moment),
        ),
    )
  )[0]!;
  await search.fill(any.metadata.title);
  await expect(
    page.getByRole("article", {
      name: new RegExp(`^${any.metadata.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} by`),
    }),
  ).toBeVisible();
});
