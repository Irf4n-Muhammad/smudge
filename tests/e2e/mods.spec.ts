import { test, expect, type Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
async function api(page: Page, path: string, body?: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch("/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error(path + ": " + r.status);
      return r.json();
    },
    { path, body },
  );
}
async function editor(page: Page, owner: string) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/profiles/" + owner) && r.request().method() === "GET",
  );
  await page.goto("/?profile=" + owner);
  const state = await (await response).json();
  if (state.manifest?.schemaVersion === 2)
    await page.getByLabel("Profile options", { exact: true }).click();
  await page.getByRole("button", { name: "Customize profile", exact: true }).click();
}
test.use({ actionTimeout: 15000 });
test("A shares a mod, B mixes it with Raka and publishes, C votes and revisits the same result", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/?profile=you");
  await page.locator(".profile-controls").waitFor();
  await api(page, "/session", { userId: "ines" });
  const initial = (await api(page, "/profile-history")).state;
  await api(page, "/session", { userId: "you" });
  const name = `Midnight club ${Date.now()}`;
  try {
    await editor(page, "you");
    await page.getByRole("button", { name: "Browse & share mods", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("After Hours / Music zine");
    await page.screenshot({ path: "artifacts/mod-library-desktop.png" });
    await page.getByRole("button", { name: "Try After Hours / Music zine", exact: true }).click();
    await page.getByRole("button", { name: "Use this preview", exact: true }).click();
    const preview = page.locator(".profile-preview").frameLocator("iframe");
    await expect(preview.locator(".mz-profile h1")).toHaveText("Alex Morgan");
    await expect(preview.locator(".mz-record")).toBeVisible();
    await expect(preview.locator(".mz-posters")).toBeVisible();
    await page
      .locator(".profile-preview")
      .screenshot({ path: "artifacts/music-zine-complete.png" });
    await preview.getByRole("button", { name: "Vote for Velvet Static", exact: true }).click();
    await expect(preview.getByRole("status")).toContainText("Practice vote saved");
    await expect(preview.locator("#mz-total")).toContainText("1 vote");
    await page.getByRole("button", { name: "Browse & share mods", exact: true }).click();
    await page.getByRole("button", { name: "Share current draft", exact: true }).click();
    await page.getByLabel("Mod name", { exact: true }).fill(name);
    await page
      .getByLabel("Mod description", { exact: true })
      .fill("Gig posters, ticket highlights and a listener-selected encore.");
    await page
      .getByLabel("I want to share this source and the included assets with other demo accounts.")
      .check();
    await page.getByRole("button", { name: "Share mod", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText(`Shared ${name}`);
    const mod = (await api(page, "/mods")).find((m: any) => m.name === name);
    expect(mod.creatorId).toBe("you");
    expect(mod.version).toBe(1);
    await api(page, "/session", { userId: "ines" });
    await editor(page, "ines");
    await page.getByRole("button", { name: "Browse & share mods", exact: true }).click();
    await page.getByLabel("Search mods").fill(name);
    await page.getByRole("button", { name: `Try ${name}`, exact: true }).click();
    await page.getByRole("button", { name: "Use this preview", exact: true }).click();
    await expect(preview.locator(".mz-profile h1")).toHaveText("Inès Laurent");
    await expect(preview.locator("#mz-total")).toContainText("0 votes");
    await page.getByRole("button", { name: "Browse & share mods", exact: true }).click();
    await page.getByLabel("Search mods").fill("Raka");
    await page.getByLabel("Mix Raka / Ink & paper", { exact: true }).selectOption("post");
    await page.getByRole("button", { name: "Use this preview", exact: true }).click();
    await expect(preview.locator(".post-grid-comic")).toBeVisible();
    await expect(preview.locator(".mz-posters")).toHaveCount(0);
    await expect(preview.locator(".mz-profile")).toBeVisible();
    await expect(preview.locator(".mz-poll")).toBeVisible();
    await page.getByRole("button", { name: "Undo last part change", exact: true }).click();
    await expect(preview.locator(".mz-posters")).toBeVisible();
    await page.getByRole("button", { name: "Browse & share mods", exact: true }).click();
    await page.getByLabel("Search mods").fill("Raka");
    await page.getByLabel("Mix Raka / Ink & paper", { exact: true }).selectOption("post");
    await page.getByRole("button", { name: "Use this preview", exact: true }).click();
    await expect(preview.locator(".post-grid-comic")).toBeVisible();
    await page.getByRole("button", { name: "Publish profile", exact: true }).click();
    await expect(page.locator(".profile-message")).toContainText("Profile published");
    await api(page, "/session", { userId: "raka" });
    await page.goto("/?profile=ines");
    const visitor = page.locator(".profile-world").frameLocator("iframe");
    await expect(visitor.locator(".mz-profile h1")).toHaveText("Inès Laurent");
    await expect(visitor.locator(".post-grid-comic")).toBeVisible();
    await visitor.getByRole("button", { name: "Vote for First Light", exact: true }).click();
    await expect(
      visitor.getByRole("button", { name: "Vote for First Light", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(
      visitor.getByRole("button", { name: "Vote for First Light", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: "artifacts/music-zine-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        visitor.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await visitor.getByRole("button", { name: "Vote for Velvet Static", exact: true }).click();
    await expect(
      visitor.getByRole("button", { name: "Vote for Velvet Static", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Profile options", { exact: true }).click();
    await page.getByRole("button", { name: "Switch to night mode", exact: true }).click();
    await expect(visitor.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByLabel("Profile options", { exact: true }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: "artifacts/music-zine-mobile.png", fullPage: true });
  } finally {
    await api(page, "/session", { userId: "ines" });
    const current = (await api(page, "/profile-history")).state;
    await api(page, "/profile-restore", {
      publicationId: initial.publicationId,
      expectedVersion: current.version,
    });
  }
});
test("MCP shares a partial feature mod, installs the pinned version and rejects forged arguments", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "apps/mcp/index.ts"],
    cwd: process.cwd(),
    env: { ...(process.env as Record<string, string>), FORMA_DATA_DIR: resolve(".local/e2e") },
    stderr: "pipe",
  });
  const client = new Client({ name: "mod-contract-test", version: "1" });
  try {
    await client.connect(transport);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result: any = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      return JSON.parse(result.content[0].text);
    };
    const list = await call("list_profile_mods");
    const starter = list.find((m: any) => m.name === "After Hours / Music zine");
    const source = await call("read_profile_mod", { modId: starter.id, version: starter.version });
    expect(source.package.manifest.poll.options).toHaveLength(3);
    const d = await call("install_profile_mod", { modId: starter.id, version: starter.version });
    const mod = await call("share_profile_mod", {
      submissionId: crypto.randomUUID(),
      draftId: d.id,
      revision: d.revision,
      name: "MCP Encore " + Date.now(),
      description: "An independent setlist voting feature.",
      slots: ["feature"],
      shareAssets: true,
    });
    expect(mod.slots).toEqual(["feature"]);
    expect(Object.keys(mod.package.manifest.parts)).toEqual(["feature"]);
    const installed = await call("install_profile_mod", { modId: mod.id, version: 1 });
    expect(installed.ownerId).toBe("you");
    const forged: any = await client.callTool({
      name: "install_profile_mod",
      arguments: { modId: mod.id, version: 1, actorId: "raka" },
    });
    expect(forged.isError).toBe(true);
  } finally {
    await client.close();
    await transport.close();
  }
});
