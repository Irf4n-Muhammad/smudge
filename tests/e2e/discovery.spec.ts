import { test, expect, type Page } from "@playwright/test";

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
test("discover a creator from a mixed profile, preview with own content, cancel or reuse and publish", async ({
  page,
}) => {
  test.setTimeout(150000);
  page.setDefaultTimeout(15000);
  await page.goto("/?profile=you");
  await page.locator(".profile-controls").waitFor();
  const originals: Record<string, any> = {};
  for (const userId of ["ines", "maya"]) {
    await api(page, "/session", { userId });
    originals[userId] = (await api(page, "/profile-history")).state;
  }
  const name = "Discovery edition " + Date.now();
  try {
    await api(page, "/session", { userId: "you" });
    const starter = (await api(page, "/mods")).find(
      (m: any) => m.name === "After Hours / Music zine",
    );
    const d = await api(page, `/mods/${starter.id}/install`, { version: starter.version });
    const shared = await api(page, "/mods", {
      submissionId: crypto.randomUUID(),
      draftId: d.id,
      revision: d.revision,
      name,
      description: "Reusable posters by this creator.",
      slots: ["post"],
      shareAssets: true,
    });
    await api(page, "/session", { userId: "ines" });
    const base = await api(page, `/mods/${starter.id}/install`, { version: starter.version });
    const mixed = await api(page, `/mods/${shared.id}/install`, {
      version: 1,
      draftId: base.id,
      revision: 1,
      slot: "post",
    });
    await api(page, `/profile-drafts/${mixed.id}/publish`, {
      revision: mixed.revision,
      expectedVersion: originals.ines.version,
    });
    await api(page, "/session", { userId: "maya" });
    await page.goto("/?profile=ines");
    await expect(
      page.locator(".profile-world").frameLocator("iframe").locator(".mz-profile h1"),
    ).toHaveText("Inès Laurent");
    await page.getByLabel("Profile options", { exact: true }).click();
    await page
      .locator(".profile-control-actions")
      .getByRole("button", { name: "Made with", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(name);
    await expect(dialog).toContainText("v1");
    await dialog.getByRole("button", { name: "By Alex Morgan", exact: true }).click();
    const card = dialog.locator(".mod-card").filter({ hasText: name });
    await expect(card).toContainText("1 public profiles using this mod");
    await page.screenshot({ path: "artifacts/creator-mods-desktop.png" });
    await dialog.getByRole("button", { name: "← Back to profile credits", exact: true }).click();
    await dialog.getByRole("button", { name: "Use this combination", exact: true }).click();
    const preview = page.locator(".mod-live-preview").frameLocator("iframe");
    await expect(preview.locator(".mz-profile h1")).toHaveText("Maya Chen");
    await expect(page.getByRole("dialog")).toContainText("Permissions in this combination");
    await page.getByRole("button", { name: "Phone preview", exact: true }).click();
    await page.screenshot({ path: "artifacts/combination-preview.png" });
    expect((await api(page, "/profile-history")).state).toEqual(originals.maya);
    await page.getByRole("button", { name: "Back without applying", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Made with", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Use this combination", exact: true }).click();
    await expect(preview.locator(".mz-profile h1")).toHaveText("Maya Chen");
    await page.getByRole("button", { name: "Use this preview", exact: true }).click();
    await expect(page).toHaveURL(/profile=maya&profileDraft=/);
    await expect(
      page.locator(".profile-preview").frameLocator("iframe").locator(".mz-profile h1"),
    ).toHaveText("Maya Chen");
    await page.getByRole("button", { name: "Publish profile", exact: true }).click();
    await expect(page.locator(".profile-message")).toContainText("Profile published");
    const creator = await api(page, "/mod-creators/you");
    expect(creator.mods.find((m: any) => m.id === shared.id).profileCount).toBe(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?profile=you&mods=1");
    await expect(page.getByRole("dialog", { name: "Creator's mods", exact: true })).toContainText(
      name,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: "artifacts/creator-mods-mobile.png" });
  } finally {
    for (const userId of ["ines", "maya"]) {
      await api(page, "/session", { userId });
      const now = (await api(page, "/profile-history")).state;
      await api(page, "/profile-restore", {
        publicationId: originals[userId].publicationId,
        expectedVersion: now.version,
      });
    }
  }
});
