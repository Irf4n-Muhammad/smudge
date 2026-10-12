import { test, expect, type Page } from "@playwright/test";

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
async function call(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(`/api${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    },
    { method, path, body },
  );
}
const pkg = (text: string) => ({
  manifest: {
    schemaVersion: 2,
    runtimeVersion: "web-v1",
    name: text,
    entrypoint: "index.html",
    capabilities: [],
    assets: [],
  },
  files: { "index.html": `<main><h1>${text}</h1></main>` },
});

test("owners edit and delete posts; people reply, mention and delete comments; links open for guests", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const metadata = {
    title: "Sunday market",
    format: "custom",
    caption: "Morning walk with @mayainframes",
    contributors: [],
  };
  const draft = (await call(page, "POST", "/drafts", { package: pkg("Mangoes"), metadata })).body;
  const post = (await call(page, "POST", `/drafts/${draft.id}/publish`, { revision: 1 })).body;
  await page.reload();
  const card = page.locator(".post-card", {
    has: page.getByRole("button", { name: "Options for Sunday market" }),
  });
  await expect(card.locator("iframe").contentFrame().locator("h1")).toHaveText("Mangoes");
  await expect(card.locator(".post-caption .mention")).toHaveText("@mayainframes");

  // Edit: the menu opens the post's draft; republishing updates the same post.
  await card.getByRole("button", { name: "Options for Sunday market" }).click();
  await card.getByRole("button", { name: "Edit post" }).click();
  await expect(page.getByRole("button", { name: /Update post/ })).toBeVisible();
  await page
    .getByRole("button", { name: /Close|Cancel/ })
    .first()
    .click();
  const edit = (await call(page, "POST", `/posts/${post.id}/edit`, {})).body;
  expect(edit.id).toBe(draft.id);
  const next = (
    await call(page, "PUT", `/drafts/${draft.id}`, {
      revision: edit.revision,
      package: pkg("Mangoes and coffee"),
      metadata,
    })
  ).body;
  const edited = (
    await call(page, "POST", `/drafts/${draft.id}/publish`, { revision: next.revision })
  ).body;
  expect(edited.id).toBe(post.id);
  await page.getByRole("button", { name: "Refresh feed" }).click();
  await expect(card.locator("iframe").contentFrame().locator("h1")).toHaveText(
    "Mangoes and coffee",
  );
  await expect(card.getByText("Edited", { exact: true })).toBeVisible();

  // Comments: a mention links to the profile, a reply sits under its comment.
  await card.getByRole("button", { name: "Open comments" }).click();
  await card.getByLabel("Write a comment").fill("Thanks for coming @leopark!");
  await card.getByRole("button", { name: "Post", exact: true }).click();
  await expect(card.locator(".comment .mention")).toHaveText("@leopark");
  await card.getByRole("button", { name: "Reply to Alex Morgan" }).click();
  await card.getByLabel("Write a reply").fill("and see you next week");
  await card.getByRole("button", { name: "Post", exact: true }).click();
  await expect(card.locator(".comment.reply")).toContainText("see you next week");
  page.once("dialog", (d) => void d.accept());
  await card
    .locator(".comment.reply")
    .getByRole("button", { name: /^Delete comment/ })
    .click();
  await expect(card.locator(".comment.reply")).toHaveCount(0);
  await expect(card.locator(".comment")).toHaveCount(1);

  // Share links work without an account.
  const guestContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const guest = await guestContext.newPage();
  await guest.goto(`/p/${post.id}`);
  await expect(guest.getByRole("heading", { name: "Sunday market" })).toBeVisible();
  await expect(guest.locator(".share-post iframe").contentFrame().locator("h1")).toHaveText(
    "Mangoes and coffee",
  );
  await expect(guest.getByText("Thanks for coming")).toBeVisible();
  await expect(guest).toHaveTitle(/Sunday market · Alex Morgan on Smudge/);
  await guest.goto("/u/mayainframes");
  await expect(guest.getByRole("heading", { name: "Maya Chen", exact: true })).toBeVisible();
  await expect(
    guest.locator(".share-profile-world iframe").contentFrame().getByText("Maya Chen’s room"),
  ).toBeVisible();
  const anonymous = await guest.evaluate(() => fetch("/api/feed").then((r) => r.status));
  expect(anonymous).toBe(401);

  // Delete: gone from the feed and from the share link.
  await signIn(page);
  page.once("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: "Options for Sunday market" }).click();
  await card.getByRole("button", { name: "Delete post" }).click();
  await expect(card).toHaveCount(0);
  await guest.goto(`/p/${post.id}`);
  await expect(guest.getByRole("heading", { name: "This post isn’t available." })).toBeVisible();
  await guestContext.close();
});
