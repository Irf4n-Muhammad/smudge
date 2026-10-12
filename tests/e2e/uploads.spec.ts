import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
async function api(page: Page, path: string, body?: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch("/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error("API failed: " + r.status);
      return r.json();
    },
    { path, body },
  );
}
test("uploaded photo and caption persist in Cutouts and Photo stack; reuse remaps cover", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a post", exact: true }).first().waitFor();
  // The navigation renders before bootstrap establishes the demo session cookie.
  await page.locator(".post-card").first().waitFor();
  await api(page, "/session", { userId: "you" });
  await page.reload();
  const original = (await api(page, "/profile-history")).state;
  const title = "Uploaded walk " + Date.now();
  const caption = "A photo from my own walk. <b>Still plain text.</b>";
  const expectedSrc =
    "data:image/jpeg;base64," + readFileSync(resolve("assets/demo/forest.jpg")).toString("base64");
  try {
    await page.getByRole("button", { name: "My studio", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "New photo post", exact: true }).click();
    await (await chooser).setFiles(resolve("assets/demo/forest.jpg"));
    await expect(dialog.getByLabel("Story title")).toHaveValue("forest");
    await dialog.getByLabel("Story title").fill(title);
    await dialog.getByLabel("A few words about it").fill(caption);
    await dialog.getByRole("button", { name: "Save & preview" }).click();
    await expect(dialog.locator(".runtime")).toHaveAttribute("data-ready", "true");
    await expect(dialog.frameLocator("iframe").getByAltText("Uploaded photo")).toHaveAttribute(
      "src",
      expectedSrc,
    );
    await dialog.getByRole("button", { name: "Publish story" }).click();
    await expect(dialog).not.toBeVisible();
    const posts = await api(page, "/feed");
    const post = posts.find((p: any) => p.metadata.title === title);
    expect(post.metadata.coverAssetId).toBeTruthy();
    const templates = await api(page, "/profile-templates");
    const publishProfile = async (pkg: unknown) => {
      const state = (await api(page, "/profile-history")).state;
      const draft = await api(page, "/profile-drafts", pkg);
      await api(page, `/profile-drafts/${draft.id}/publish`, {
        revision: draft.revision,
        expectedVersion: state.version,
      });
      await page.goto("/?profile=you");
    };
    await publishProfile(templates.raka);
    const frame = page.locator(".profile-world").frameLocator("iframe");
    const card = frame.getByRole("button", { name: "Open " + title, exact: true });
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByAltText(title)).toHaveAttribute("src", expectedSrc);
    await expect(card).toContainText(caption);
    await publishProfile(templates.stack);
    await expect(frame.locator(".stack-card.active img")).toHaveAttribute("src", expectedSrc);
    await frame.getByRole("button", { name: "Flip " + title, exact: true }).click();
    await expect(frame.locator(".stack-card.active .stack-back p")).toHaveText(caption);
    await page.reload();
    await expect(frame.locator(".stack-card.active img")).toHaveAttribute("src", expectedSrc);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(frame.locator(".stack-card.active img")).toBeVisible();
    await page.screenshot({ path: "artifacts/upload-stack-mobile.png", fullPage: true });
    await api(page, "/session", { userId: "raka" });
    const remix = await api(page, `/posts/${post.id}/reuse`, {});
    expect(remix.metadata.coverAssetId).not.toBe(post.metadata.coverAssetId);
    expect(remix.package.manifest.assets).toContain(remix.metadata.coverAssetId);
    expect(remix.package.files["index.html"]).toContain("asset:" + remix.metadata.coverAssetId);
  } finally {
    await api(page, "/session", { userId: "you" });
    const state = (await api(page, "/profile-history")).state;
    await api(page, "/profile-restore", {
      publicationId: original.publicationId,
      expectedVersion: state.version,
    });
  }
});
