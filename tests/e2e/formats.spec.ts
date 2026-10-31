import { test, expect, type Page } from "@playwright/test";

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

test("a post made with another post's format is numbered, and the format page gathers every version", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const as = (userId: string) => call(page, "POST", "/session", { userId });
  const title = `Guess the song ${Date.now()}`;
  const metadata = { title, format: "custom", caption: "", contributors: [] };
  const made: string[] = [];
  try {
    await as("you");
    const draft = (await call(page, "POST", "/drafts", { package: pkg("Original"), metadata }))
      .body;
    const original = (await call(page, "POST", `/drafts/${draft.id}/publish`, { revision: 1 }))
      .body;
    made.push(original.id);

    // Maya reuses the format; the client cannot point the draft at another original.
    await as("maya");
    const copy = (await call(page, "POST", `/posts/${original.id}/reuse`, {})).body;
    expect(copy.remixOf).toBe(original.id);
    const version = (await call(page, "POST", `/drafts/${copy.id}/publish`, { revision: 1 })).body;
    made.push(version.id);
    // A version of a version still counts toward the original.
    const again = (await call(page, "POST", `/posts/${version.id}/reuse`, {})).body;
    expect(again.remixOf).toBe(original.id);
    const second = (await call(page, "POST", `/drafts/${again.id}/publish`, { revision: 1 })).body;
    made.push(second.id);

    await as("you");
    await page.goto(`/?post=${second.id}`);
    const mark = page.getByRole("button", { name: /Version 2 of .*’s “Guess the song/ });
    await expect(mark).toBeVisible();
    await page.screenshot({ path: "test-results/format-version.png" });
    await mark.click();

    await expect(page).toHaveURL(new RegExp(`format=${original.id}`));
    await expect(page.locator(".format-heading h1")).toHaveText(title);
    await expect(page.locator(".format-heading p")).toContainText("2 versions so far");
    await expect(page.locator(".post-list .post-card")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "2 versions of this format" })).toBeVisible();
    await page.screenshot({ path: "test-results/format-page.png" });

    // Reloading keeps the page; an unknown format says so.
    await page.reload();
    await expect(page.locator(".format-heading h1")).toHaveText(title);
    await page.goto("/?format=missing");
    await expect(page.getByText("This format isn’t here anymore.")).toBeVisible();
  } finally {
    for (const id of made.reverse()) {
      const owner = id === made.at(-1) ? "you" : "maya";
      await as(owner);
      await call(page, "DELETE", `/posts/${id}`);
    }
    await as("you");
  }
});
