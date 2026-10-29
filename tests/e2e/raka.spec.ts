import { test, expect, type Locator, type Page } from "@playwright/test";
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
      return { status: r.status, data: await r.json() };
    },
    { path, body },
  );
}
test("Raka drawing, social actions, responsive night mode and modular editor persist", async ({
  page,
}) => {
  // This covers multiple publications, mobile screenshots and every part editor in one journey.
  test.setTimeout(150000);
  page.setDefaultTimeout(15000);
  await page.goto("/?profile=raka");
  await page.locator(".profile-controls").waitFor();
  // Existing isolated test data intentionally survives runs; explicitly publish the current artwork.
  await api(page, "/session", { userId: "raka" });
  const current = (await api(page, "/profile-history")).data.state;
  const template = (await api(page, "/profile-templates")).data.raka;
  const artDraft = (await api(page, "/profile-drafts", template)).data;
  expect(
    (
      await api(page, `/profile-drafts/${artDraft.id}/publish`, {
        revision: artDraft.revision,
        expectedVersion: current.version,
      })
    ).status,
  ).toBe(200);
  await api(page, "/session", { userId: "you" });
  await page.reload();
  const frame = page.locator(".profile-world").frameLocator("iframe");
  await expect(frame.getByRole("heading", { name: "Kai", exact: true })).toBeVisible();
  await expect(frame.locator(".drawing-hand use")).toHaveAttribute("clip-path", "url(#clip-hand)");
  await expect(frame.locator(".portrait use")).toHaveAttribute("href", "#raka-art");
  await expect(frame.locator(".post-grid-comic")).toBeVisible();
  await expect(frame.locator(".photo-stack")).toHaveCount(0);
  for (const width of [1440, 390, 320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await frame
      .getByRole("button", { name: "Explore sketchbook", exact: true })
      .scrollIntoViewIfNeeded();
    const runtime = page.locator(".profile-world iframe");
    await expect
      .poll(async () => {
        const f = await (await runtime.elementHandle())!.contentFrame();
        return f!.evaluate(
          () => Math.abs(document.body.getBoundingClientRect().height - innerHeight) < 3,
        );
      })
      .toBe(true);
    const f = await (await runtime.elementHandle())!.contentFrame();
    expect(await f!.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cells = await frame
      .locator(".post-tile")
      .evaluateAll((nodes) => nodes.slice(0, 2).map((n) => n.getBoundingClientRect().x));
    expect(cells[1]).toBeGreaterThan(cells[0]!);
    await frame
      .getByRole("button", { name: "Explore sketchbook", exact: true })
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const endButton = await frame
      .getByRole("button", { name: "Explore sketchbook", exact: true })
      .boundingBox();
    const nav = await page.locator(width <= 700 ? ".mobile-nav" : ".sidebar").boundingBox();
    if (width <= 700) expect(endButton!.y + endButton!.height).toBeLessThan(nav!.y);
    // Wider screens move the navigation into a left sidebar beside the profile.
    else
      expect(nav!.x + nav!.width).toBeLessThanOrEqual(
        (await page.locator(".profile-world").boundingBox())!.x,
      );
    await page.screenshot({ path: `artifacts/raka-finished-bottom-${width}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(frame.getByRole("heading", { name: "Kai", exact: true })).toBeInViewport();
    if (width <= 390) {
      const sizes = await frame.locator(".identity").evaluate((el) => {
        const follow = el.querySelector("button")!.getBoundingClientRect();
        return {
          bio: parseFloat(getComputedStyle(el.querySelector(".bio")!).fontSize),
          followHeight: follow.height,
          caption: parseFloat(getComputedStyle(document.querySelector(".post-tile p")!).fontSize),
        };
      });
      expect(sizes.bio).toBeGreaterThanOrEqual(14);
      expect(sizes.caption).toBeGreaterThanOrEqual(13);
      expect(sizes.followHeight).toBeGreaterThanOrEqual(44);
      expect(endButton!.y + endButton!.height).toBeGreaterThan(nav!.y - 100);
      await page.screenshot({
        path: `artifacts/raka-mobile-complete-${width}.png`,
        fullPage: true,
      });
      await frame.getByRole("button", { name: "Add your mark" }).click();
      await frame.getByRole("button", { name: "Add a star" }).click();
      await expect(frame.getByRole("button", { name: "Save contribution" })).toBeEnabled();
      const toolBounds = await frame.locator("#relay-tools").boundingBox();
      const postsBounds = await frame.locator(".published-posts").boundingBox();
      expect(toolBounds!.y + toolBounds!.height).toBeLessThan(postsBounds!.y);
      await frame.getByRole("button", { name: "Cancel drawing" }).click();
    }
  }
  await page.setViewportSize({ width: 1024, height: 1536 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () =>
      parseFloat(
        await page.locator(".profile-world iframe").evaluate((el) => getComputedStyle(el).height),
      ),
    )
    .toBeGreaterThan(1400);
  await page.screenshot({ path: "artifacts/raka-reference-comparison.png", fullPage: true });
  await page.getByLabel("Profile options", { exact: true }).click();
  await page.getByRole("button", { name: "Search posts", exact: true }).click();
  await page.getByLabel("Search published posts").fill("Pages from Sunday");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Pages from Sunday/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("One more page");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  const followButton = frame.locator("#profile-follow");
  await expect(followButton).toBeEnabled();
  const followed = await followButton.getAttribute("aria-pressed");
  await followButton.click();
  await expect(followButton).toHaveAttribute(
    "aria-pressed",
    followed === "true" ? "false" : "true",
  );
  const inlineLike = frame.getByRole("button", { name: "Like Pages from Sunday", exact: true });
  const liked = await inlineLike.getAttribute("aria-pressed");
  await inlineLike.click();
  await expect(inlineLike).toHaveAttribute("aria-pressed", liked === "true" ? "false" : "true");
  await page.reload();
  await expect(inlineLike).toHaveAttribute("aria-pressed", liked === "true" ? "false" : "true");
  await expect(frame.getByRole("button", { name: "Add your mark" })).toBeEnabled();
  const before = parseInt(await frame.locator("#relay-contributors").innerText());
  await frame.getByRole("button", { name: "Add your mark" }).click();
  await frame.getByRole("button", { name: "Add a star" }).click();
  const profileFrame = page.locator(".profile-world iframe");
  const frameUrl = await profileFrame.getAttribute("src");
  await page.setViewportSize({ width: 900, height: 650 });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await expect(profileFrame).toHaveAttribute("src", frameUrl!);
  await expect(frame.getByRole("button", { name: "Save contribution" })).toBeEnabled();
  await frame.getByRole("button", { name: "Undo stroke" }).click();
  await expect(frame.getByRole("button", { name: "Save contribution" })).toBeDisabled();
  await frame.getByRole("button", { name: "Red ink" }).click();
  await frame.locator("canvas").evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await frame.locator("canvas").boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { steps: 8 });
  await page.mouse.up();
  await frame.getByRole("button", { name: "Save contribution" }).click();
  await expect(frame.locator("#relay-status")).toContainText("Your contribution is saved");
  await page.reload();
  await expect(frame.locator("#relay-contributors")).toContainText(`${before + 1} contributions`);
  await frame.getByRole("button", { name: "Open Pages from Sunday", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^Like ·|^Unlike ·/ }).click();
  await dialog.getByRole("button", { name: /^Comments ·/ }).click();
  await dialog
    .getByRole("textbox", { name: "Write a comment" })
    .fill("A mark from the browser test.");
  await dialog.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    dialog.getByText("A mark from the browser test.", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await frame.getByRole("button", { name: /Sketchbook/ }).click();
  await expect(dialog).toHaveAttribute("aria-label", "Sketchbook");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({ path: "artifacts/raka-desktop.png", fullPage: true });
  await page.getByLabel("Profile options", { exact: true }).click();
  await page.getByRole("button", { name: "Switch to night mode" }).click();
  await page.getByLabel("Profile options", { exact: true }).click();
  await page.getByLabel("Profile options", { exact: true }).click();
  await page.getByRole("button", { name: "Reduce motion", exact: true }).click();
  await page.getByLabel("Profile options", { exact: true }).click();
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(frame.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/raka-mobile-night.png", fullPage: true });
  await expect
    .poll(async () => {
      const f = await (await page.locator(".profile-world iframe").elementHandle())!.contentFrame();
      return f!.evaluate(
        () => Math.abs(document.body.getBoundingClientRect().height - innerHeight) < 3,
      );
    })
    .toBe(true);
  await api(page, "/session", { userId: "raka" });
  await page.reload();
  await page.getByLabel("Profile options", { exact: true }).click();
  await page.getByRole("button", { name: "Customize profile" }).click();
  const initial = (await api(page, "/profile-history")).data.state;
  try {
    await page.getByRole("button", { name: "Edit a copy of live profile", exact: true }).click();
    expect((await api(page, "/profile-history")).data.state).toEqual(initial);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await changePart(page, "post", "basic");
    await page.locator(".profile-preview").scrollIntoViewIfNeeded();
    const preview = page.locator(".profile-preview").frameLocator("iframe");
    await expect(preview.locator(".post-grid")).not.toHaveClass(/post-grid-comic/);
    await expect(preview.locator(".masthead")).toBeVisible();
    await expect(preview.getByRole("heading", { name: "DRAWING RELAY" })).toBeVisible();
    await clickSettled(page.getByRole("button", { name: "Compare with live", exact: true }));
    await expect(page.locator(".profile-preview")).toHaveAttribute("inert", "");
    await expect(preview.locator(".post-grid")).toHaveClass(/post-grid-comic/);
    await clickSettled(page.getByRole("button", { name: "Back to draft", exact: true }));
    await expect(preview.locator(".post-grid")).not.toHaveClass(/post-grid-comic/);
    await clickSettled(page.getByRole("button", { name: "Undo last part change", exact: true }));
    await expect(preview.locator(".post-grid")).toHaveClass(/post-grid-comic/);
    await clickSettled(page.getByRole("button", { name: "Posts", exact: true }));
    await clickSettled(page.getByRole("button", { name: "Use Smudge / Straight", exact: true }));
    await expect(preview.locator(".post-grid")).not.toHaveClass(/post-grid-comic/);
    await page.screenshot({ path: "artifacts/profile-visual-editor.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: "artifacts/profile-visual-editor-mobile.png", fullPage: true });
    await changePart(page, "post", "stack");
    await expect(preview.locator(".photo-stack")).toBeVisible();
    await expect(preview.locator(".masthead")).toBeVisible();
    await expect(preview.locator("#relay-canvas")).toBeVisible();
    await expect(preview.locator(".stack-counter")).toHaveText("1 / 3");
    await preview.locator(".stack-card.active .stack-front button").click();
    await expect(preview.locator(".stack-card.active .stack-back")).toBeVisible();
    await expect(preview.locator('.stack-card.active [data-action="like"]')).toBeDisabled();
    await preview.getByRole("button", { name: "Back to photo", exact: true }).click();
    await preview.getByRole("button", { name: "Next photo", exact: true }).click();
    await expect(preview.locator(".stack-counter")).toHaveText("2 / 3");
    const stack = preview.locator(".stack-stage");
    await stack.focus();
    await stack.press("ArrowLeft");
    await expect(preview.locator(".stack-counter")).toHaveText("1 / 3");
    await stack.scrollIntoViewIfNeeded();
    const stackBox = (await stack.boundingBox())!;
    await page.mouse.move(stackBox.x + stackBox.width * 0.7, stackBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(stackBox.x + stackBox.width * 0.2, stackBox.y + 80, { steps: 8 });
    await page.mouse.up();
    await expect(preview.locator(".stack-counter")).toHaveText("2 / 3");
    await preview.getByRole("button", { name: "Open post", exact: false }).click();
    await expect(dialog).toBeVisible();
    await clickSettled(page.getByRole("button", { name: "Close dialog" }));
    await clickSettled(page.getByRole("button", { name: "Undo last part change", exact: true }));
    await expect(preview.locator(".post-grid")).toBeVisible();
    await changePart(page, "feature", "none");
    await page.locator(".profile-preview").scrollIntoViewIfNeeded();
    await expect(preview.getByRole("heading", { name: "Kai", exact: true })).toBeVisible();
    await expect(preview.getByRole("heading", { name: "DRAWING RELAY" })).toHaveCount(0);
    await clickSettled(page.getByRole("button", { name: "Publish profile", exact: true }));
    await expect(page.getByRole("status")).toContainText("Profile published");
    await changePart(page, "feature", "raka");
    await page.locator(".profile-preview").scrollIntoViewIfNeeded();
    await expect(preview.locator("#relay-contributors")).toContainText("0 contributions");
    await clickSettled(page.getByRole("button", { name: "Publish profile", exact: true }));
    await expect(page.getByRole("status")).toContainText("Profile published");
    await page.getByLabel("Profile options", { exact: true }).click();
    await clickSettled(page.getByRole("button", { name: "View published profile" }));
    await expect(frame.locator("#relay-contributors")).toContainText(`${before + 1} contributions`);
  } finally {
    const state = (await api(page, "/profile-history")).data.state;
    await api(page, "/profile-restore", {
      publicationId: initial.publicationId,
      expectedVersion: state.version,
    });
  }
});
test("MCP composes a partial package, checks revisions and creates a visitor preview", async ({
  page,
}) => {
  const client = new Client({ name: "composition-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("scripts/mcp.mjs")],
    env: { ...process.env, FORMA_DATA_DIR: resolve(".local/e2e") } as Record<string, string>,
  });
  await client.connect(transport);
  async function tool(name: string, args: Record<string, unknown> = {}) {
    const r = await client.callTool({ name, arguments: args });
    return { error: r.isError, data: JSON.parse((r.content as { text: string }[])[0]!.text) };
  }
  try {
    const templates = (await tool("profile_templates")).data;
    const draft = (await tool("create_profile_draft", { package: templates.raka })).data;
    const args = {
      draftId: draft.id,
      revision: draft.revision,
      slot: "post",
      donor: templates.basic,
    };
    const mixed = await tool("compose_profile_part", args);
    expect(mixed.error).toBeFalsy();
    expect(mixed.data.package.manifest.parts.post.name).toBe("Smudge / Straight");
    expect((await tool("compose_profile_part", args)).data.error).toBe("REVISION_CONFLICT");
    const preview = (await tool("preview_profile_draft", { draftId: draft.id })).data;
    await page.goto(preview.url);
    await expect(
      page
        .locator(".profile-preview")
        .frameLocator("iframe")
        .getByRole("heading", { name: "Alex", exact: true }),
    ).toBeVisible();
  } finally {
    await client.close();
  }
});

/**
 * Scrolls a host control into view before clicking it. When Playwright's click has to scroll the
 * page itself, Chromium can route the click into the cross-origin profile frame underneath while
 * the scroll settles, and the host button never sees it.
 */
async function clickSettled(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  await target.click();
}
async function changePart(page: Page, slot: string, choice: string) {
  await page
    .getByRole("button", {
      name: (
        { profile: "Profile", post: "Posts", story: "Stories", feature: "Feature" } as Record<
          string,
          string
        >
      )[slot],
      exact: true,
    })
    .click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/compose") && r.request().method() === "POST",
  );
  await page.getByLabel(`${slot} part`, { exact: true }).selectOption(choice);
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const draft = await saved.json();
  await expect(page.locator(".profile-preview-toolbar")).toContainText(
    `saved revision ${draft.revision}`,
  );
  await expect(page.getByLabel(`${slot} part`, { exact: true })).toBeEnabled();
}
