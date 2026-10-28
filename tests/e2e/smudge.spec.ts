import { test, expect, type Page } from "@playwright/test";
import { openMoreMenu } from "./nav";

test("post buttons open pages in the in-app sheet, and the season can be switched", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Smudge home" }).first()).toBeVisible();

  // A button without a URL opens the post's own page, made in Smudge.
  const festival = page.getByRole("article", { name: /Fieldnight Festival · Day 2 by Maya Chen/ });
  await festival.getByRole("button", { name: "Get tickets" }).click();
  const sheet = page.getByRole("dialog", { name: "Fieldnight Festival · Day 2" });
  await expect(sheet.getByText("Made in Smudge")).toBeVisible();
  const page1 = sheet.frameLocator("iframe");
  await page1.getByRole("radio", { name: /WEEKEND/ }).check({ force: true });
  await page1.getByRole("button", { name: /I'M GOING/ }).click();
  await expect(page1.locator("#done")).toContainText("Weekend pass");
  await sheet.getByRole("button", { name: "Close page" }).click();
  await expect(sheet).toHaveCount(0);

  // A button with an https URL opens that site in the sheet, with a way out to the browser.
  const mural = page.getByRole("article", { name: /The wall on Rua das Flores/ });
  await expect(mural.getByText("Opens en.wikipedia.org right here in Smudge")).toBeVisible();
  await mural.getByRole("button", { name: "Read the story" }).click();
  const outside = page.getByRole("dialog", { name: "The wall on Rua das Flores" });
  const frame = outside.locator("iframe.outside-page");
  await expect(frame).toHaveAttribute("src", "https://en.wikipedia.org/wiki/Street_art");
  await expect(frame).toHaveAttribute("sandbox", /allow-scripts/);
  expect(await frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
  await expect(outside.getByRole("link", { name: "Open in browser" })).toHaveAttribute(
    "target",
    "_blank",
  );
  await page.keyboard.press("Escape");
  await expect(outside).toHaveCount(0);

  // The season is the viewer's pick and survives a reload.
  const before = await page.evaluate(() => document.documentElement.dataset.season);
  await (await openMoreMenu(page)).getByRole("button", { name: /^Season:/ }).click();
  const after = await page.evaluate(() => document.documentElement.dataset.season);
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.season)).toBe(after);
});

test("the Paint wall profile shows real posts, follows the season and opens post buttons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?profile=ines");
  const frame = page.locator(".profile-page .runtime iframe").first().contentFrame();
  await expect(frame.getByRole("heading", { name: "Inès", exact: true })).toBeVisible();
  await expect(frame.locator("#giant-line")).toContainText("paints the city");
  // Chapters under the hero: one measurable thing each (ADR 0048).
  await expect(frame.locator(".chapter-music .big strong")).toHaveText("212");
  // The host's season reaches the profile frame and follows a change.
  const season = await page.evaluate(() => document.documentElement.dataset.season);
  await expect(frame.locator("html")).toHaveAttribute("data-season", season!);
  await page.evaluate(() => {
    document.documentElement.dataset.season =
      document.documentElement.dataset.season === "halloween" ? "paint" : "halloween";
  });
  await expect(frame.locator("html")).not.toHaveAttribute("data-season", season!);

  // Posts and Stories take the look's colours (ADR 0049): the ground and the accent on the strip.
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("button", { name: /^Posts/ })
    .click();
  const posts = page.locator(".profile-page.has-look");
  await expect(posts).toHaveCSS("background-color", "rgb(14, 13, 11)");
  // Inès paints in the Sunset palette, so the strip's accent is its yellow.
  await expect(page.getByRole("button", { name: "Follow" })).toHaveCSS(
    "background-color",
    "rgb(255, 201, 61)",
  );
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("button", { name: "Page" })
    .click();

  // Posts open in the host dialog, which keeps the post's button.
  await frame.getByRole("button", { name: "Open The wall on Rua das Flores" }).first().click();
  const dialog = page.getByRole("dialog", { name: "The wall on Rua das Flores" });
  await expect(dialog.getByRole("button", { name: "Read the story" })).toBeVisible();
  await dialog.getByRole("button", { name: "Read the story" }).click();
  await expect(page.locator("iframe.outside-page")).toHaveAttribute(
    "src",
    "https://en.wikipedia.org/wiki/Street_art",
  );
  await page.getByRole("button", { name: "Close page" }).click();
  await expect(page.locator(".page-sheet")).toHaveCount(0);
});

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

test("the easy editor: pick a vibe, tap to edit, add The Wall, publish, a friend leaves a note", async ({
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

    // Tapping an outlined part opens its field instead of using the page.
    await frame.locator("#giant-line").click();
    await expect(page.getByRole("textbox", { name: "Your line" })).toBeVisible();
    await page.getByRole("textbox", { name: "Your line" }).fill("*draws* on everything.");
    await expect(page.getByText("Draft saved · only you see it")).toBeVisible();
    await expect(frame.locator("#giant-line")).toHaveText("draws on everything.");
    await expect(frame.locator("#giant-line em")).toHaveText("draws");
    // The song under the name is typed here until the page reads one from the archive.
    await frame.locator("#hero-now").click();
    await page.getByRole("textbox", { name: "Song", exact: true }).fill("Velvet Static");
    await page.getByRole("textbox", { name: "Artist" }).fill("After Hours");
    await expect(frame.locator("#song-title")).toHaveText("Velvet Static");
    await expect(frame.locator("#song-by")).toHaveText("After Hours");
    // A chapter: one measurable thing, drawn by the page (ADR 0048).
    await page.getByRole("button", { name: "Chapters", exact: true }).click();
    await page.getByRole("button", { name: "Add a chapter" }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.getByRole("textbox", { name: "Title" }).fill("Slow, but *far*.");
    await page.getByRole("textbox", { name: "Big number" }).fill("1:52:10");
    await expect(frame.locator(".chapter-run h2")).toHaveText("Slow, but far.");
    await expect(frame.locator(".chapter-run .big strong")).toHaveText("1:52:10");
    await expect(frame.locator(".chapter-run .route")).toBeVisible();
    // A photo of the owner's own goes into the chapter (ADR 0050).
    await page.getByLabel("Upload a chapter photo").setInputFiles("assets/demo/spray.jpg");
    await expect(frame.locator(".chapter-run .photo img")).toHaveAttribute("src", /^data:image/);

    // Add The Wall from the section sheet; it shows in the draft straight away.
    await page.getByRole("button", { name: "Section", exact: true }).click();
    await page.getByRole("button", { name: /The Wall/ }).click();
    await expect(frame.locator(".sx-wall")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Order", exact: true }).click();
    await expect(page.locator(".easy-order")).toContainText("The Wall");
    await page.getByRole("button", { name: "Colors", exact: true }).click();
    await page.getByRole("radio", { name: "Sunset" }).click();
    await expect(page.getByText("Draft saved · only you see it")).toBeVisible();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(frame.locator("html")).not.toHaveAttribute("data-editing", "on");
    await page.screenshot({ path: "artifacts/easy-editor-mobile.png" });

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Profile published.")).toBeVisible();

    // A friend sees the published wall and sticks a note on it.
    await api(page, "/session", { userId: "maya" });
    await page.goto("/?profile=you");
    const live = page.locator(".profile-world iframe").contentFrame();
    await expect(live.locator("#giant-line")).toHaveText("draws on everything.");
    await live.getByRole("textbox", { name: "Your note" }).fill("Nice wall!");
    await live.getByRole("button", { name: "Stick it" }).click();
    await expect(live.locator(".sx-note").filter({ hasText: "Nice wall!" })).toBeVisible();
    await expect(live.locator(".sx-note").filter({ hasText: "Nice wall!" })).toContainText(
      "Maya Chen",
    );

    // Someone else can report it; it disappears for them straight away.
    await api(page, "/session", { userId: "leo" });
    await page.goto("/?profile=you");
    const note = live.locator(".sx-note").filter({ hasText: "Nice wall!" });
    await note.getByRole("button", { name: "Report note from Maya Chen" }).click();
    await note.getByRole("button", { name: "Spam" }).click();
    await expect(live.getByText("That note is hidden for you")).toBeVisible();
    await expect(live.locator(".sx-note").filter({ hasText: "Nice wall!" })).toHaveCount(0);
  } finally {
    await api(page, "/session", { userId: "you" });
    const now = (await api(page, "/profile-history")).state;
    await api(page, "/profile-restore", {
      publicationId: initial.publicationId,
      expectedVersion: now.version,
    });
  }
});

test("every vibe can be edited by tapping it, without the preview flashing", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?profile=you");
  await page.locator(".profile-controls").waitFor();
  await api(page, "/session", { userId: "you" });
  await page.goto("/?profile=you");
  await page.getByRole("button", { name: "Edit profile" }).first().click();
  const go = page.getByRole("button", { name: /Use this vibe/ });
  const editing = page.getByText("Editing your profile");
  await expect(go.or(editing)).toBeVisible();
  if (!(await go.isVisible()))
    await page.getByRole("button", { name: "Vibe", exact: true }).click();
  await page.getByRole("option", { name: "Room" }).click();
  await go.click();
  await expect(editing).toBeVisible();
  const frame = page.locator(".easy-layer.shown iframe").contentFrame();

  await frame.locator("#bio").click();
  await page.getByRole("textbox", { name: "Bio" }).fill("Plants, tapes and too many mugs.");
  await expect(page.getByText("Draft saved · only you see it")).toBeVisible();
  await expect(frame.locator("#bio")).toHaveText("Plants, tapes and too many mugs.");
  // While the next version loads, the current one stays on screen.
  await expect(page.locator(".easy-layer.shown")).toHaveCount(1);

  await frame.locator(".note").click();
  await page.getByRole("textbox", { name: "Your pinned note" }).fill("stuff I love.");
  await expect(frame.locator(".note")).toHaveText("stuff I love.");
  await page.getByRole("button", { name: "Colors", exact: true }).click();
  await page.getByRole("radio", { name: "Sage" }).click();
  await expect(page.getByText("Draft saved · only you see it")).toBeVisible();
  await expect(frame.locator("html")).toHaveAttribute("data-editing", "on");
  await page.screenshot({ path: "artifacts/easy-editor-room.png" });

  // Ink & Paper: tapping the posts opens their layout.
  await page.getByRole("button", { name: "Vibe", exact: true }).click();
  await page.getByRole("option", { name: "Ink & Paper" }).click();
  await go.click();
  await expect(editing).toBeVisible();
  await frame.locator(".published-posts").click();
  await page.getByRole("button", { name: "Round" }).click();
  await expect(page.getByText("Draft saved · only you see it")).toBeVisible();
  await expect(page.getByRole("button", { name: "Round" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Cancel" }).click();
});
