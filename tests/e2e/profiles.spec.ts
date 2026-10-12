import { test, expect, type Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

async function request(page: Page, path: string, body?: unknown, method?: string) {
  return page.evaluate(
    async ({ path, body, method }) => {
      const r = await fetch("/api" + path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, data: await r.json() };
    },
    { path, body, method },
  );
}

test("public room and comic profiles open real owner posts, follow and honor visitor preferences", async ({
  page,
}) => {
  await page.goto("/?profile=maya");
  const frame = page.locator(".profile-world").frameLocator("iframe");
  await expect(frame.getByRole("heading", { name: "Maya Chen’s room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Customize profile" })).toHaveCount(0);
  const follow = page.getByRole("button", { name: /^(Follow|Unfollow)$/ });
  const before = await follow.innerText();
  await follow.click();
  await expect(follow).toHaveText(before === "Follow" ? "Unfollow" : "Follow");
  await frame.getByRole("button", { name: "Open A beautiful little mess", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute("aria-label", "A beautiful little mess");
  await expect(page.getByRole("dialog").locator(".runtime")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Reduce motion", exact: true }).click();
  await expect(frame.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.getByRole("button", { name: "Switch to night mode" }).click();
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "artifacts/profile-room-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/profile-room-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.reload();
  await expect(frame.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.getByRole("button", { name: "Report profile" }).click();
  await expect(page.getByRole("status")).toContainText("Report recorded locally");
  await page.goto("/?profile=leo");
  await expect(frame.getByRole("heading", { name: "Leo Park" })).toBeVisible();
  await frame.getByRole("button", { name: "Open Take the scenic route" }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute("aria-label", "Take the scenic route");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({ path: "artifacts/profile-comic-mobile.png", fullPage: true });
});

test("profile editor saves, previews, publishes, imports and restores immutable versions", async ({
  page,
}) => {
  await page.goto("/?profile=you");
  await page.getByRole("button", { name: "Customize profile" }).click();
  const initial = (await request(page, "/profile-history")).data.state;
  // The single-file room opens straight in the source editor; modular starters open visually.
  await page.getByLabel("Profile starting point").selectOption("room");
  await page.getByRole("button", { name: "Create profile draft" }).click();
  const code = page.getByRole("textbox", { name: "Profile source code" });
  await code.fill(
    '<h1>My personal workshop</h1><button id="greet">Open the window</button><p id="note"></p><script>document.getElementById("greet").onclick=()=>document.getElementById("note").textContent="Hello from my world"</script>',
  );
  await expect(page.getByRole("button", { name: "Publish profile", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save profile draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("button", { name: "Preview as visitor" }).click();
  await page.getByRole("button", { name: "Mobile preview", exact: true }).click();
  const preview = page.locator(".profile-preview").frameLocator("iframe");
  await preview.getByRole("button", { name: "Open the window" }).click();
  await expect(preview.getByText("Hello from my world")).toBeVisible();
  await page.screenshot({ path: "artifacts/profile-editor.png", fullPage: true });
  await page.getByRole("button", { name: "Publish profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profile published");
  const first = (await request(page, "/profile-history")).data.state;
  await page.getByRole("button", { name: "View published profile" }).click();
  await expect(
    page
      .locator(".profile-world")
      .frameLocator("iframe")
      .getByRole("heading", { name: "My personal workshop" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Customize profile" }).click();
  const pkg = {
    manifest: {
      kind: "profile",
      schemaVersion: 1,
      runtimeVersion: "web-v1",
      name: "Imported world",
      entrypoint: "index.html",
      height: 800,
      assets: [],
      capabilities: [],
    },
    files: { "index.html": "<h1>Imported architecture</h1>" },
  };
  await page.getByLabel("Import profile package").setInputFiles({
    name: "profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pkg)),
  });
  await expect(code).toHaveValue(pkg.files["index.html"]);
  await page.getByRole("button", { name: "Publish profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profile published");
  await page
    .locator(".profile-version")
    .filter({ hasText: "A room of my own" })
    .first()
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Previous version restored");
  expect((await request(page, "/profile-history")).data.state.publicationId).toBe(
    first.publicationId,
  );
  await page.getByRole("button", { name: "View published profile" }).click();
  await expect(
    page
      .locator(".profile-world")
      .frameLocator("iframe")
      .getByRole("heading", { name: "My personal workshop" }),
  ).toBeVisible();
  const state = (await request(page, "/profile-history")).data.state;
  expect(
    (
      await request(page, "/profile-restore", {
        publicationId: initial.publicationId,
        expectedVersion: state.version,
      })
    ).status,
  ).toBe(200);
});

test("real MCP profile authoring previews, publishes and restores with runtime and account isolation", async ({
  page,
}) => {
  const client = new Client({ name: "profile-e2e", version: "1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("scripts/mcp.mjs")],
    cwd: resolve("."),
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"),
      ),
      FORMA_DATA_DIR: resolve(".local/e2e"),
    },
  });
  await client.connect(transport);
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    expect(r.isError).not.toBe(true);
    return JSON.parse((r.content as { text: string }[])[0]!.text);
  };
  const initial = await tool("profile_history");
  try {
    expect((await tool("profile_spec")).schemaVersion).toBe(1);
    const foreign = (await tool("profile_data", { ownerId: "maya" })).posts[0].id;
    const pkg = {
      manifest: {
        kind: "profile",
        schemaVersion: 1,
        runtimeVersion: "web-v1",
        name: "MCP library",
        entrypoint: "index.html",
        height: 850,
        assets: [],
        capabilities: ["profile.read", "profile.openPost"],
      },
      files: {
        "index.html": `<h1>A library built through MCP</h1><p id="owner"></p><p id="host"></p><p id="net"></p><p id="foreign"></p><button id="open">Read first publication</button><script>let post;forma.profile.read().then(d=>{document.getElementById('owner').textContent=d.owner.name;post=d.posts[0]});document.getElementById('open').onclick=()=>forma.profile.openPost(post.id);try{parent.document.body.dataset.escaped='yes';document.getElementById('host').textContent='escaped'}catch{document.getElementById('host').textContent='Host blocked'}fetch('https://example.com').catch(()=>document.getElementById('net').textContent='Network blocked');forma.profile.openPost('${foreign}').catch(e=>document.getElementById('foreign').textContent=e.message);</script>`,
      },
    };
    expect((await tool("validate_profile_package", { package: pkg })).valid).toBe(true);
    const draft = await tool("create_profile_draft", { package: pkg });
    const preview = await tool("preview_profile_draft", { draftId: draft.id });
    await page.goto(preview.url);
    const frame = page.locator(".profile-preview").frameLocator("iframe");
    await expect(frame.getByRole("heading", { name: "A library built through MCP" })).toBeVisible();
    await expect(frame.getByText("Host blocked")).toBeVisible();
    await expect(frame.getByText("Network blocked")).toBeVisible();
    await expect(frame.getByText("NOT_FOUND", { exact: true })).toBeVisible();
    const oldTicket = (
      await request(page, "/runtime", { kind: "profile", target: draft.id, preview: true })
    ).data.ticket;
    const revised = await tool("update_profile_draft", {
      draftId: draft.id,
      revision: draft.revision,
      package: pkg,
    });
    const stale = await request(page, "/capability", {
      ticket: oldTicket,
      request: { type: "forma:request", id: crypto.randomUUID(), method: "profile.read" },
    });
    expect(stale.status).toBe(409);
    const published = await tool("publish_profile_draft", {
      draftId: draft.id,
      revision: revised.revision,
      expectedVersion: initial.state.version,
    });
    await page.goto("/");
    // Finish bootstrapping before rotating the session; a late bootstrap can replace its cookie.
    await expect(page.locator(".post-card").first()).toBeVisible();
    await request(page, "/session", { userId: "ines" });
    expect((await request(page, `/profile-drafts/${draft.id}`)).status).toBe(404);
    expect(
      (
        await request(page, `/profile-drafts/${draft.id}/publish`, {
          revision: revised.revision,
          expectedVersion: 0,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(page, "/capability", {
          ticket: oldTicket,
          request: { type: "forma:request", id: crypto.randomUUID(), method: "profile.read" },
        })
      ).status,
    ).toBe(403);
    await page.goto("/?profile=you");
    const live = page.locator(".profile-world").frameLocator("iframe");
    await expect(live.getByText("Alex Morgan", { exact: true })).toBeVisible();
    await live.getByRole("button", { name: "Read first publication" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    expect(await page.locator("body").getAttribute("data-escaped")).toBeNull();
    expect(published.publicationId).toBeTruthy();
  } finally {
    const current = await tool("profile_history");
    await tool("restore_profile", {
      publicationId: initial.state.publicationId,
      expectedVersion: current.state.version,
    });
    await client.close();
  }
});
