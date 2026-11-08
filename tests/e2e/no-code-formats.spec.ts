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
const newest = async (page: Page, title: string) => {
  const feed = (await call(page, "GET", "/feed")).body as {
    id: string;
    metadata: { title: string };
  }[];
  return feed.find((p) => p.metadata.title === title)?.id;
};

test("a photo and one question: posted in a few taps, answered with one in the feed", async ({
  page,
}) => {
  await signIn(page, "you");
  let posted: string | undefined;
  try {
    await page
      .getByRole("button", { name: "Create a post" })
      .filter({ visible: true })
      .first()
      .click();
    const pick = page.getByRole("dialog", { name: "Pick a post style" });
    await page.screenshot({ path: "test-results/ask-entry.png" });
    await pick.getByLabel("Ask with a photo").setInputFiles(resolve("assets/demo/coast.jpg"));

    // Straight to the question: the photo is already in.
    const editor = page.getByRole("dialog", { name: "Edit your post" });
    const frame = editor.locator(".easy-layer.shown iframe").contentFrame();
    const question = editor.getByRole("region", { name: "Your question" });
    await question.getByRole("textbox").fill("Swim before *breakfast*?");
    await expect(frame.locator("h1 em").last()).toHaveText("breakfast");
    await expect(frame.locator(".ask img")).toHaveCount(1);

    // Tapping the answer box sets how friends answer.
    await frame.locator("[data-ask]").click({ position: { x: 20, y: 10 } });
    const how = editor.getByRole("region", { name: "How friends answer" });
    await how.getByLabel("Option 1").fill("Obviously");
    await how.getByLabel("Option 2").fill("Coffee first");
    await expect(frame.getByRole("button", { name: "Coffee first" })).toBeVisible();
    await expect(editor.getByText("Draft saved · only you see it")).toBeVisible();
    await page.screenshot({ path: "test-results/ask-editor.png" });
    await editor.getByRole("button", { name: "Publish" }).click();
    await expect(editor).toHaveCount(0);

    posted = await newest(page, "Swim before breakfast?");
    expect(posted).toBeTruthy();
    await page.goto(`/?post=${posted}`);
    const card = page.locator(".post-card").first();
    const post = card.locator("iframe").contentFrame();
    await expect(post.locator("h1")).toContainText("Swim before breakfast?");
    await post.getByRole("button", { name: "Obviously" }).click();
    await expect(post.locator("[data-ask-who]")).toHaveText("You answered");
    await expect(post.getByRole("button", { name: /Obviously/ })).toContainText("100%");
    await page.screenshot({ path: "test-results/ask-answered.png" });

    // Maya follows Alex: she sees Alex's pick next to hers.
    await call(page, "POST", "/session", { userId: "maya" });
    await page.goto(`/?post=${posted}`);
    const hers = page.locator(".post-card").first().locator("iframe").contentFrame();
    await hers.getByRole("button", { name: "Coffee first" }).click();
    await expect(hers.locator("[data-ask-who]")).toContainText("answered");
    await expect(hers.getByRole("button", { name: /Coffee first/ })).toContainText("%");
  } finally {
    await call(page, "POST", "/session", { userId: "you" });
    if (posted) await call(page, "DELETE", `/posts/${posted}`);
  }
});

test("ticking Fill-in turns an easy post into a format anyone can make their own", async ({
  page,
}) => {
  await signIn(page, "you");
  let posted: string | undefined;
  let version: string | undefined;
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
    const frame = editor.locator(".easy-layer.shown iframe").contentFrame();
    await editor.getByLabel("Add photos").setInputFiles(resolve("assets/demo/lake.jpg"));
    await expect(editor.getByRole("button", { name: "Edit photo 1" })).toBeVisible();
    await frame.locator("h1").click();
    await editor
      .getByRole("region", { name: "Headline" })
      .getByRole("textbox")
      .fill("My week in *one word*");

    await editor.getByRole("button", { name: "Fill-in", exact: true }).click();
    const fill = editor.getByRole("region", { name: "Let people make their own" });
    await fill.getByRole("button", { name: "Make it fillable" }).click();
    await expect(fill.getByLabel("Headline")).toBeChecked();
    await expect(fill.getByLabel("Cover photo")).toBeChecked();
    await expect(editor.getByRole("button", { name: "Fill-in, on" })).toBeVisible();
    await expect(editor.getByText("Draft saved · only you see it")).toBeVisible();
    await page.screenshot({ path: "test-results/fill-in-sheet.png" });
    await editor.getByRole("button", { name: "Publish" }).click();
    await expect(editor).toHaveCount(0);
    posted = await newest(page, "My week in one word");
    expect(posted).toBeTruthy();

    // Someone else posts their version from the form: their words and photo, Alex's design.
    await call(page, "POST", "/session", { userId: "maya" });
    await page.goto(`/?post=${posted}`);
    const card = page.locator(".post-card").first();
    await card.getByRole("button", { name: "Use format" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Headline").fill("Chaotic but *golden*");
    await dialog.getByLabel("Choose Photo").setInputFiles(resolve("assets/demo/forest.jpg"));
    await dialog.getByRole("button", { name: "Post my version" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?post=(?!${posted})`));
    version = new URL(page.url()).searchParams.get("post")!;
    const theirs = page.locator(".post-card").first().locator("iframe").contentFrame();
    await expect(theirs.locator("h1")).toContainText("Chaotic but golden");
    await expect(theirs.locator("h1 em")).toHaveText("golden");
    await page.screenshot({ path: "test-results/fill-in-version.png" });
    const fields = (await call(page, "GET", `/posts/${version}/fields`)).body.fields as {
      key: string;
      value: string;
    }[];
    const feed = (await call(page, "GET", "/feed")).body as {
      id: string;
      metadata: { coverAssetId?: string };
    }[];
    expect(feed.find((p) => p.id === version)?.metadata.coverAssetId).toBe(
      fields.find((f) => f.key === "photo")!.value,
    );
  } finally {
    await call(page, "POST", "/session", { userId: "maya" });
    if (version) await call(page, "DELETE", `/posts/${version}`);
    await call(page, "POST", "/session", { userId: "you" });
    if (posted) await call(page, "DELETE", `/posts/${posted}`);
  }
});
