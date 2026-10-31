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

test("anyone makes their own version of a fill-in format from a form, without the code", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await call(page, "POST", "/session", { userId: "you" });
  const feed = (await call(page, "GET", "/feed")).body as {
    id: string;
    metadata: { title: string };
    remix?: unknown;
  }[];
  // The format itself; versions people made keep its title.
  const quiz = feed.find((p) => p.metadata.title === "Guess the song from emoji" && !p.remix)!;
  expect(quiz).toBeTruthy();
  let mine: string | undefined;
  try {
    await page.goto(`/?post=${quiz.id}`);
    const card = page.locator(".post-card").first();
    await expect(card.locator("iframe").contentFrame().locator("h1")).toHaveText(
      "Guess the song from emoji",
    );
    await card.getByRole("button", { name: "Use format" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Clue 1 (emoji)")).toHaveValue("☔️🎤💃");
    await dialog.getByLabel("Title").fill("Tebak lagu ala Alex");
    await dialog.getByLabel("Clue 1 (emoji)").fill("🍕🍕🍕");
    await dialog.getByLabel("Answer 1", { exact: true }).fill("Pizza Party");
    await page.screenshot({ path: "test-results/fill-form.png" });
    await dialog.getByRole("button", { name: "Post my version" }).click();

    await expect(page).toHaveURL(new RegExp(`\\?post=(?!${quiz.id})`));
    mine = new URL(page.url()).searchParams.get("post")!;
    const version = page.locator(".post-card").first();
    const frame = version.locator("iframe").contentFrame();
    await expect(frame.locator("h1")).toHaveText("Tebak lagu ala Alex");
    // One clue at a time, picked with a tap; only what was changed is new.
    await expect(frame.locator("#clue")).toHaveText("🍕🍕🍕");
    await frame.getByRole("button", { name: "Pizza Party" }).click();
    await expect(frame.locator("#clue")).toHaveText("🧊🧊👶");
    await frame.getByRole("button", { name: "Let It Go" }).click();
    await frame.getByRole("button", { name: "Octopus's Garden" }).click();
    await expect(frame.locator("#score")).toHaveText("1 / 3");
    await expect(
      version.getByRole("button", { name: /Version \d+ of .*Guess the song/ }),
    ).toBeVisible();
    await page.screenshot({ path: "test-results/fill-version.png" });

    // A post without fields still opens the code in the studio.
    const plain = feed.find((p) => p.id !== quiz.id && p.metadata.title === "Saturday, up top");
    if (plain) {
      const fields = (await call(page, "GET", `/posts/${plain.id}/fields`)).body;
      expect(fields).toEqual({ fields: [] });
    }
    // Someone else's photo cannot be slipped in as yours.
    const other = (await call(page, "GET", `/posts/${quiz.id}/fields`)).body.fields.find(
      (f: { kind: string }) => f.kind === "image",
    );
    const sneaky = await call(page, "POST", `/posts/${quiz.id}/fill`, {
      values: { photo: other.value },
    });
    expect(sneaky.status).toBe(403);
  } finally {
    if (mine) await call(page, "DELETE", `/posts/${mine}`);
  }
});
