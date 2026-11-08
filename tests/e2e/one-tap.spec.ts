import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function call(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(`/api${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { method, path, body },
  );
}
async function signIn(page: Page, userId: string) {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await call(page, "POST", "/session", { userId });
  await page.reload();
  await page.locator(".post-card").first().waitFor();
}
type FeedPost = { id: string; ownerId: string; metadata: { title: string } };
const feed = async (page: Page) => (await call(page, "GET", "/feed")).body as FeedPost[];

test("a new post gets one tap in its feed card, and today's format says what kind it is", async ({
  page,
}) => {
  await signIn(page, "you");
  await expect(page.getByRole("region", { name: "Today’s format" })).toContainText(
    /Today’s format · (Everyday question|Rank it|Play)/,
  );
  let posted: string | undefined;
  try {
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
    await editor.getByLabel("Add photos").setInputFiles(resolve("assets/demo/lake.jpg"));
    await expect(editor.getByRole("button", { name: "Edit photo 1" })).toBeVisible();
    const preview = editor.locator(".easy-layer.shown iframe").contentFrame();
    await preview.locator("h1").click();
    await editor
      .getByRole("region", { name: "Headline" })
      .getByRole("textbox")
      .fill("Lake day, *finally*");
    await expect(preview.locator(".answer.tap")).toBeVisible();
    await expect(editor.getByText("Draft saved · only you see it")).toBeVisible();
    await editor.getByRole("button", { name: "Publish" }).click();
    await expect(editor).toHaveCount(0);
    posted = (await feed(page)).find((p) => p.metadata.title === "Lake day, finally")?.id;
    expect(posted).toBeTruthy();

    // Maya sees it in a feed card, the tap in view without opening the post.
    await call(page, "POST", "/session", { userId: "maya" });
    await page.goto(`/?post=${posted}`);
    const frame = page.locator(".post-card").first().locator("iframe").contentFrame();
    const fire = frame.getByRole("button", { name: "🔥" });
    await expect(fire).toBeInViewport();
    await fire.click();
    await expect(fire).toContainText("100%");
    await page.screenshot({ path: "test-results/one-tap.png" });
  } finally {
    await call(page, "POST", "/session", { userId: "you" });
    if (posted) await call(page, "DELETE", `/posts/${posted}`);
  }
});
