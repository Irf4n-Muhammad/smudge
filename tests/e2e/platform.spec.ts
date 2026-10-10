import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

async function boot(page: Page) {
  await page.goto("/");
  await expect(page.locator(".post-card").first()).toBeVisible();
}
async function post(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(`/api${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, body },
  );
}
const custom = (html: string, capabilities: string[] = []) => ({
  manifest: {
    schemaVersion: 2,
    runtimeVersion: "web-v1",
    name: "A new experience",
    entrypoint: "index.html",
    assets: [],
    capabilities,
  },
  files: { "index.html": html },
});

test("feed formats, progress persistence, comments and bookmarks", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: "Scrapbooks", exact: true }).click();
  const card = page.getByRole("article", { name: "Postcards from the coast by Maya Chen" });
  await card.scrollIntoViewIfNeeded();
  const frame = card.frameLocator("iframe");
  const note = frame.getByRole("button", { name: /little note|Fold the note/ });
  await expect(note).toBeVisible();
  if ((await note.getAttribute("aria-expanded")) === "true") await note.click();
  await note.click();
  await expect(note).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await page.getByRole("button", { name: "Scrapbooks", exact: true }).click();
  await card.scrollIntoViewIfNeeded();
  await expect(
    card.frameLocator("iframe").getByRole("button", { name: "Fold the note ↙" }),
  ).toHaveAttribute("aria-expanded", "true");
  await card.getByRole("button", { name: "Open comments" }).click();
  const text = `A memory ${Date.now()}`;
  await card.getByRole("textbox", { name: "Write a comment" }).fill(text);
  await card.getByRole("button", { name: "Post", exact: true }).click();
  await expect(card.getByText(text, { exact: false })).toBeVisible();
  if (await card.getByRole("button", { name: "Unsave post", exact: true }).count())
    await card.getByRole("button", { name: "Unsave post", exact: true }).click();
  await card.getByRole("button", { name: "Save post", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Saved", exact: true })
    .click();
  await expect(card).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Your feed", exact: true })
    .click();
  await page.getByRole("button", { name: "Stories", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Take the scenic route by Leo Park" }),
  ).toBeVisible();
  const story = page
    .getByRole("article", { name: "Take the scenic route by Leo Park" })
    .frameLocator("iframe");
  await page
    .getByRole("article", { name: "Take the scenic route by Leo Park" })
    .scrollIntoViewIfNeeded();
  await story.getByRole("button", { name: "Into the woods ↗" }).click();
  await expect(story.getByRole("heading", { name: "A little further in." })).toBeVisible();
});

test("studio edits, uploads, previews and publishes an immutable revision", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: "Create a post", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "New draft", exact: true }).click();
  const title = `A studio story ${Date.now()}`;
  await dialog.getByLabel("Story title").fill(title);
  await dialog.getByRole("button", { name: "Save & preview" }).click();
  await expect(dialog.getByText("Saved locally", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Photos & people" }).click();
  await dialog
    .locator('.media-pane input[type="file"][accept^="image/jpeg"]')
    .setInputFiles(resolve("assets/demo/forest.jpg"));
  await expect(page.getByRole("status")).toContainText("Photo added");
  await dialog.getByRole("button", { name: "Save & preview" }).click();
  await expect(dialog.locator(".runtime")).toHaveAttribute("data-ready", "true");
  await dialog.getByRole("button", { name: "Publish story" }).click();
  await expect(dialog).not.toBeVisible();
  const published = page.getByRole("article", { name: `${title} by Alex Morgan` });
  await expect(published).toBeVisible();
  await published
    .frameLocator("iframe")
    .getByRole("button", { name: "Open a little surprise ↗" })
    .click();
  await expect(
    published.frameLocator("iframe").getByText("A little surprise, just for you."),
  ).toBeVisible();
});

test("real MCP client creates a novel interaction, revises, previews and publishes", async ({
  page,
}) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("scripts/mcp.mjs")],
    cwd: resolve("."),
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      FORMA_DATA_DIR: resolve(".local/e2e"),
    },
  });
  const client = new Client({ name: "forma-e2e", version: "1.0.0" });
  await client.connect(transport);
  try {
    expect((await client.listTools()).tools.map((t) => t.name)).toContain("preview_draft");
    async function tool(name: string, args: Record<string, unknown> = {}) {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError).not.toBe(true);
      return JSON.parse((r.content as { type: string; text: string }[])[0]!.text);
    }
    const spec = await tool("read_spec");
    expect(spec.schemaVersions).toEqual([1, 2]);
    const name = `Pocket observatory ${Date.now()}`;
    const pkg = custom(
      `<style>main{background:#1c2841;color:#f5e7bb;padding:50px;min-height:450px}h1{font:36px Georgia}button{padding:14px;background:#f5e7bb;color:#1c2841;border:0;border-radius:30px}</style><main><small>A POCKET OBSERVATORY</small><h1 id="phase">New moon</h1><p>Turn the sky one night at a time.</p><button id="turn">Turn the sky</button></main><script>let step=0;const phases=['New moon','Crescent','Full moon'];function draw(){document.getElementById('phase').textContent=phases[step%3]}forma.progress.read().then(s=>{step=s.step||0;draw()});document.getElementById('turn').onclick=async()=>{step++;draw();await forma.progress.write({step})}</script>`,
      ["viewer.progress.read", "viewer.progress.write"],
    );
    const d = await tool("create_draft", {
      package: pkg,
      metadata: {
        title: name,
        caption: "Made through MCP, not a built-in template.",
        format: "custom",
        contributors: [],
      },
    });
    const revised = await tool("update_draft", {
      draftId: d.id,
      revision: d.revision,
      package: pkg,
      metadata: { ...d.metadata, caption: "A small sky, made through an external MCP client." },
    });
    const preview = await tool("preview_draft", { draftId: d.id });
    expect(preview.url).toContain(`?draft=${d.id}`);
    const publication = await tool("publish_draft", { draftId: d.id, revision: revised.revision });
    expect((await tool("publish_draft", { draftId: d.id, revision: revised.revision })).id).toBe(
      publication.id,
    );
    await boot(page);
    await page.getByLabel("Preview as demo account").selectOption("leo");
    await expect(page.getByRole("status")).toContainText("Now viewing");
    const card = page.getByRole("article", { name: `${name} by Alex Morgan` });
    await expect(card).toBeVisible();
    await card.frameLocator("iframe").getByRole("button", { name: "Turn the sky" }).click();
    await expect(
      card.frameLocator("iframe").getByRole("heading", { name: "Crescent" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      card.frameLocator("iframe").getByRole("heading", { name: "Crescent" }),
    ).toBeVisible();
  } finally {
    await client.close();
  }
});

test("sandbox blocks host access and network; undeclared and cross-account operations fail", async ({
  page,
}) => {
  await boot(page);
  const pkg = custom(
    `<main><h1>Isolation probe</h1><p id="dom"></p><p id="net"></p><p id="cap"></p></main><script>try{parent.document.body.dataset.compromised='yes';document.getElementById('dom').textContent='escaped'}catch{document.getElementById('dom').textContent='Host access blocked'}fetch('https://example.com').then(()=>document.getElementById('net').textContent='network escaped').catch(()=>document.getElementById('net').textContent='Network blocked');forma.progress.write({probe:true}).catch(e=>document.getElementById('cap').textContent=e.message);</script>`,
  );
  const d = await post(page, "/drafts", {
    package: pkg,
    metadata: { title: "Isolation probe", format: "custom", contributors: [] },
  });
  expect(d.status).toBe(200);
  await post(page, `/drafts/${d.body.id}/publish`, { revision: 1 });
  await page.reload();
  const card = page.getByRole("article", { name: "Isolation probe by Alex Morgan" }).first();
  const frame = card.frameLocator("iframe");
  await expect(frame.getByText("Host access blocked")).toBeVisible();
  await expect(frame.getByText("Network blocked")).toBeVisible();
  await expect(frame.getByText("CAPABILITY_DENIED")).toBeVisible();
  expect(await page.locator("body").getAttribute("data-compromised")).toBeNull();
  const runtimeResponse = await post(page, "/runtime", { target: d.body.id, preview: true });
  await page.getByLabel("Preview as demo account").selectOption("ines");
  await expect(page.getByRole("status")).toContainText("Now viewing");
  const forbidden = await post(page, `/drafts/${d.body.id}/publish`, { revision: 1 });
  expect(forbidden.status).toBe(404);
  const replay = await post(page, "/capability", {
    ticket: runtimeResponse.body.ticket,
    request: { type: "forma:request", id: crypto.randomUUID(), method: "viewer.progress.read" },
  });
  expect(replay.status).toBe(403);
  const hostile = await page.request.post("/api/session", {
    headers: { origin: "https://evil.example" },
    data: { userId: "you" },
  });
  expect(hostile.status()).toBe(403);
  await page.getByRole("button", { name: "Together", exact: true }).click();
  const shared = page
    .getByRole("article", { name: "The weekend, together by Maya Chen" })
    .frameLocator("iframe");
  await shared.getByRole("textbox", { name: "Your memory" }).fill("Not invited");
  await shared.getByRole("button", { name: "Add your memory +" }).click();
  await expect(shared.getByText("This notebook is open to Alex and Maya only.")).toBeVisible();
});

test("desktop/mobile layouts and offscreen runtime lifecycle", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: "Scrapbooks", exact: true }).click();
  await expect(page.locator(".runtime").first()).toHaveAttribute("data-ready", "true");
  await page.screenshot({ path: "artifacts/feed-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/feed-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.getByRole("button", { name: "For you", exact: true }).click();
  await page.locator(".feed-end").scrollIntoViewIfNeeded();
  await expect(page.locator(".post-card").first().locator("iframe")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Create a post" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
