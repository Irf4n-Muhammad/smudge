import { test, expect } from "@playwright/test";

test("every page has a strip to its Posts and Stories, inside the app and on the share link", async ({
  page,
  browser,
}) => {
  await page.goto("/?profile=you");
  const strip = page.getByRole("navigation", { name: "Pages" });
  await expect(strip.getByRole("button", { name: "Page" })).toHaveAttribute("aria-current", "page");

  // Posts: a collage of tiles, each opening the post.
  await strip.getByRole("button", { name: /^Posts/ }).click();
  await expect(page).toHaveURL(/page=posts/);
  const posts = page.getByRole("list", { name: "Posts" });
  await expect(posts).toBeVisible();
  const tiles = posts.getByRole("button");
  expect(await tiles.count()).toBeGreaterThan(0);
  await tiles.first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // Stories: the days, read from what happened.
  await strip.getByRole("button", { name: "Stories" }).click();
  await expect(page).toHaveURL(/page=stories/);
  const stories = page.getByRole("list", { name: "Stories" });
  await expect(stories).toBeVisible();
  await expect(stories.getByRole("heading").first()).toBeVisible();

  // Back to the landing page, which is the person's own.
  await strip.getByRole("button", { name: "Page" }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByRole("region", { name: "Right now" })).toBeVisible();

  // A guest gets the same three pages at /u/<handle>, /u/<handle>/posts and /u/<handle>/stories.
  const guestContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const guest = await guestContext.newPage();
  await guest.goto("/u/alex/posts");
  await expect(guest.getByRole("list", { name: "Posts" })).toBeVisible();
  const guestStrip = guest.getByRole("navigation", { name: "Pages" });
  await expect(guestStrip.getByRole("link", { name: /^Posts/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await guestStrip.getByRole("link", { name: "Stories" }).click();
  // In development the route compiles on its first visit, which can take a while.
  await expect(guest).toHaveURL(/\/u\/alex\/stories$/, { timeout: 60000 });
  await expect(guest.getByRole("list", { name: "Stories" })).toBeVisible();
  await guestStrip.getByRole("link", { name: "Page" }).click();
  await expect(guest).toHaveURL(/\/u\/alex$/);
  await expect(guest.getByRole("navigation", { name: "Pages" })).toBeVisible();
  await guestContext.close();
});
