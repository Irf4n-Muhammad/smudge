import { test, expect, type Page } from "@playwright/test";

async function api(page: Page, path: string, body?: unknown, method?: string) {
  return page.evaluate(
    async ({ path, body, method }) => {
      const r = await fetch("/api" + path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error(path + ": " + r.status);
      return r.json();
    },
    { path, body, method },
  );
}

test("programs between people: the owner adds a quiz and a cat, a friend takes the quiz and feeds the cat", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?profile=you");
  await page.locator(".profile-controls").waitFor();
  await api(page, "/session", { userId: "you" });
  const initial = (await api(page, "/profile-history")).state;
  try {
    await page.goto("/?profile=you");
    await page.getByRole("button", { name: "Edit profile" }).first().click();
    const go = page.getByRole("button", { name: /Use this vibe/ });
    const editing = page.getByText("Editing your profile");
    await expect(go.or(editing)).toBeVisible();
    if (await go.isVisible()) {
      await page.getByRole("option", { name: "Paint wall" }).click();
      await go.click();
    }
    await expect(editing).toBeVisible();
    const frame = page.locator(".easy-layer.shown iframe").contentFrame();

    // The quiz: questions are written in the editor and saved with the owner, not the page.
    await page.getByRole("button", { name: "Section", exact: true }).click();
    await page.getByRole("button", { name: /^Quiz/ }).click();
    await expect(frame.locator(".sx-quiz")).toBeVisible();
    await page.getByLabel("Question 1", { exact: true }).fill("My coffee order?");
    await page.getByLabel("Question 1 option 1").fill("Black");
    await page.getByLabel("Question 1 option 2").fill("Latte");
    await page.getByLabel("Question 1 right answer 2").check();
    await page.getByRole("button", { name: "Save questions" }).click();
    await expect(page.getByText("Questions saved")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // The cat gets a name.
    await page.getByRole("button", { name: "Section", exact: true }).click();
    await page.getByRole("button", { name: /The Cat/ }).click();
    await expect(frame.locator(".sx-cat-card")).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("Mochi");
    await expect(page.getByText("Draft saved · only you see it")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Profile published.")).toBeVisible();

    // A friend takes the quiz and feeds the cat.
    await api(page, "/session", { userId: "maya" });
    await page.goto("/?profile=you");
    const live = page.locator(".profile-world iframe").contentFrame();
    await live.getByRole("button", { name: "Start" }).click();
    await live.getByRole("button", { name: "Latte" }).click();
    await expect(live.locator(".sx-score strong")).toHaveText("1/1");
    await expect(live.locator(".sx-score")).toContainText("Perfect");
    await live.getByRole("button", { name: "Feed Mochi" }).click();
    await expect(live.locator(".sx-cat-text")).toContainText("Fed today by Maya Chen");
    await expect(live.getByRole("button", { name: /Fed ✓/ })).toBeDisabled();
    await expect(live.getByRole("img", { name: "Mochi is fine" })).toBeVisible();

    // The owner sees the board and who fed the cat; the owner's own answers do not count.
    await api(page, "/session", { userId: "you" });
    await page.goto("/?profile=you");
    await expect(live.getByRole("list", { name: "Best scores" })).toContainText("Maya Chen");
    await expect(live.locator(".sx-cat-text")).toContainText("Maya Chen");
  } finally {
    await api(page, "/session", { userId: "you" });
    const now = (await api(page, "/profile-history")).state;
    await api(page, "/profile-restore", {
      publicationId: initial.publicationId,
      expectedVersion: now.version,
    });
  }
});
