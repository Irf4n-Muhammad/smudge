import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function api(page: Page, path: string, body?: unknown, method?: string) {
  return page.evaluate(
    async ({ path, body, method }) => {
      const r = await fetch("/api" + path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
      return r.json();
    },
    { path, body, method },
  );
}

test.use({ actionTimeout: 15000 });

test("make a personal profile from Raka, preview privately, mix parts and publish to another visitor", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/?profile=raka");
  await page.locator(".profile-controls").waitFor();
  await api(page, "/session", { userId: "ines" });
  const original = (await api(page, "/profiles/ines/data")).owner;
  const history = await api(page, "/profile-history");
  const templates = await api(page, "/profile-templates");
  const originalPackage =
    history.publications.find((p: { id: string }) => p.id === history.state.publicationId)
      ?.package ?? templates.basic;
  try {
    await page.reload();
    await page.getByLabel("Profile options", { exact: true }).click();
    await page.getByRole("button", { name: "Use this design", exact: true }).click();
    await expect(page).toHaveURL(/profile=ines&profileDraft=/);
    const preview = page.locator(".profile-preview").frameLocator("iframe");
    await expect(preview.getByRole("heading", { name: original.name, exact: true })).toBeVisible();
    await expect(preview.locator(".drawing-hand")).toBeVisible();
    await preview.getByRole("button", { name: /Add your mark/ }).click();
    await preview.getByRole("button", { name: "Add a star", exact: true }).click();
    await expect(preview.getByRole("button", { name: /Save contribution/ })).toBeEnabled();
    await preview.getByRole("button", { name: "Cancel drawing", exact: true }).click();
    await preview
      .getByRole("heading", { name: original.name, exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/personal-profile-default-editor.png" });
    await page.getByLabel("Profile display name", { exact: true }).fill("Nova Paper");
    await page
      .getByLabel("Profile bio", { exact: true })
      .fill("Field notes, little discoveries, and the things I make.");
    await page.getByLabel("Upload profile avatar").setInputFiles(resolve("assets/demo/forest.jpg"));
    await expect(page.getByLabel("Profile avatar", { exact: true })).not.toHaveValue("");
    await page.getByText("Composition", { exact: true }).click();
    await page.getByLabel("Post columns", { exact: true }).selectOption("1");
    await page.getByLabel("Card shape", { exact: true }).selectOption("round");
    await page.getByLabel("Highlight shape", { exact: true }).selectOption("tiles");
    await page.getByLabel("Highlight order", { exact: true }).selectOption("reverse");
    await page.getByLabel("Show header illustration", { exact: true }).uncheck();
    await page.getByLabel("Move post up", { exact: true }).click();
    await page.getByLabel("Move post up", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Publish profile", exact: true })).toBeDisabled();
    expect((await api(page, "/profiles/ines/data")).owner.name).toBe(original.name);
    await page.getByRole("button", { name: "Apply changes to preview", exact: true }).click();
    await expect(preview.getByRole("heading", { name: "Nova Paper", exact: true })).toBeVisible();
    await expect(preview.getByRole("img", { name: "Nova Paper avatar" })).toBeVisible();
    await expect(preview.locator(".drawing-hand")).toBeHidden();
    await expect(preview.locator(".post-tile").first()).toHaveCSS("border-radius", "22px");
    await expect(page.getByRole("button", { name: "Undo last edit", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Undo last edit", exact: true }).click();
    await expect(preview.getByRole("heading", { name: original.name, exact: true })).toBeVisible();
    await page.getByLabel("Profile display name", { exact: true }).fill("Nova Paper");
    await page
      .getByLabel("Profile bio", { exact: true })
      .fill("Field notes, little discoveries, and the things I make.");
    await page.getByLabel("Profile avatar", { exact: true }).selectOption({ label: "forest.jpg" });
    await page.getByText("Composition", { exact: true }).click();
    await page.getByLabel("Post columns", { exact: true }).selectOption("1");
    await page.getByLabel("Card shape", { exact: true }).selectOption("round");
    await page.getByLabel("Highlight shape", { exact: true }).selectOption("tiles");
    await page.getByLabel("Highlight order", { exact: true }).selectOption("reverse");
    await page.getByLabel("Show header illustration", { exact: true }).uncheck();
    await page.getByLabel("Move post up", { exact: true }).click();
    await page.getByLabel("Move post up", { exact: true }).click();
    await page.getByRole("button", { name: "Apply changes to preview", exact: true }).click();
    await expect(preview.getByRole("heading", { name: "Nova Paper", exact: true })).toBeVisible();
    await page.reload();
    await expect(preview.getByRole("heading", { name: "Nova Paper", exact: true })).toBeVisible();
    const parts = page.locator(".part-workbench");
    await parts.getByRole("button", { name: "Posts", exact: true }).click();
    await parts.getByLabel("post part", { exact: true }).selectOption("basic");
    await expect(page.locator(".profile-message")).toContainText("Changed post");
    await expect(preview.locator(".post-tile").first()).toHaveCSS("border-radius", "22px");
    await parts.getByRole("button", { name: "Feature", exact: true }).click();
    await parts.getByLabel("feature part", { exact: true }).selectOption("none");
    await expect(page.locator(".profile-message")).toContainText("Changed feature");
    await expect(preview.locator(".relay")).toHaveCount(0);
    await page.getByText("Add a photo post", { exact: true }).click();
    await page
      .getByLabel("New profile photo", { exact: true })
      .setInputFiles(resolve("assets/demo/coast.jpg"));
    await expect(page.getByRole("img", { name: "New photo preview" })).toBeVisible();
    const title = `Coastal notebook ${Date.now()}`;
    await page.getByLabel("New photo title", { exact: true }).fill(title);
    await page
      .getByLabel("New photo caption", { exact: true })
      .fill("A little further along the coast.");
    await page.getByRole("button", { name: "Publish photo", exact: true }).click();
    await expect(page.locator(".profile-content [role=status]")).toContainText("Photo published");
    await expect(preview.getByRole("button", { name: `Open ${title}`, exact: true })).toBeVisible();
    expect((await api(page, "/profiles/ines/data")).owner.name).toBe(original.name);
    const draftId = new URL(page.url()).searchParams.get("profileDraft")!;
    const draft = await api(page, `/profile-drafts/${draftId}`);
    expect(draft.package.files["index.html"].indexOf("<!--forma:post-->")).toBeLessThan(
      draft.package.files["index.html"].indexOf("<!--forma:story-->"),
    );
    await page.getByRole("button", { name: "Mobile preview", exact: true }).click();
    await expect
      .poll(async () =>
        preview
          .locator("body")
          .evaluate(
            () =>
              Math.abs(
                Math.min(
                  4000,
                  Math.max(600, Math.ceil(document.body.getBoundingClientRect().height)),
                ) - innerHeight,
              ) < 3,
          ),
      )
      .toBe(true);
    expect(
      await preview
        .locator("body")
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await preview
      .getByRole("heading", { name: "Nova Paper", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/personal-profile-editor.png" });
    await page.getByRole("button", { name: "Desktop preview", exact: true }).click();
    await page.getByRole("button", { name: "Publish profile", exact: true }).click();
    await expect(page.locator(".profile-message")).toContainText("Profile published");
    await api(page, "/session", { userId: "raka" });
    await page.goto("/?profile=ines");
    const visitor = page.locator(".profile-world").frameLocator("iframe");
    await expect(visitor.getByRole("heading", { name: "Nova Paper", exact: true })).toBeVisible();
    await expect(visitor.getByRole("img", { name: "Nova Paper avatar" })).toBeVisible();
    await expect(visitor.getByRole("button", { name: `Open ${title}`, exact: true })).toBeVisible();
    await expect(visitor.locator(".relay")).toHaveCount(0);
    expect(await page.evaluate(async () => (await fetch("/api/users/ines/avatar")).status)).toBe(
      200,
    );
    await page.screenshot({ path: "artifacts/personal-profile-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () =>
        visitor
          .locator("body")
          .evaluate(
            () =>
              Math.abs(
                Math.min(
                  4000,
                  Math.max(600, Math.ceil(document.body.getBoundingClientRect().height)),
                ) - innerHeight,
              ) < 3,
          ),
      )
      .toBe(true);
    expect(
      await visitor
        .locator("body")
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/personal-profile-visitor-mobile.png",
      fullPage: true,
    });
  } finally {
    // Restore identity through the same public draft workflow; never reset the test database.
    await api(page, "/session", { userId: "ines" });
    const cleanup = await api(page, "/profile-drafts", originalPackage);
    const saved = await api(
      page,
      `/profile-drafts/${cleanup.id}`,
      {
        revision: cleanup.revision,
        package: originalPackage,
        identity: {
          name: original.name,
          bio: original.bio,
          avatarAssetId: original.avatarAssetId ?? null,
        },
      },
      "PUT",
    );
    const state = (await api(page, "/profile-history")).state;
    const published = await api(page, `/profile-drafts/${saved.id}/publish`, {
      revision: saved.revision,
      expectedVersion: state.version,
    });
    await api(page, "/profile-restore", {
      publicationId: history.state.publicationId,
      expectedVersion: published.version,
    });
  }
});
