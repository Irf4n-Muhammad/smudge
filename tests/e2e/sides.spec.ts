import { test, expect } from "@playwright/test";

// Every test here ends back in Everyday: the demo account is shared with the specs that follow.
test.afterEach(async ({ page }) => {
  await page.evaluate(() =>
    fetch("/api/sides/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side: "everyday" }),
    }),
  );
});

test("switching sides changes the feed and where a new post goes; a private side stays unseen", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const bar = page.getByRole("navigation", { name: "Your sides" });
  await expect(bar.getByRole("button", { name: "Everyday" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article", { name: /^Saturday, up top/ })).toHaveCount(1);
  await expect(page.getByRole("article", { name: /^Sunday long run/ })).toHaveCount(0);

  await bar.getByRole("button", { name: "Runners" }).click();
  await expect(bar.getByRole("button", { name: "Runners" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article", { name: /^Sunday long run/ })).toHaveCount(1);
  await expect(page.getByRole("article", { name: /^Saturday, up top/ })).toHaveCount(0);
  await expect(page.locator(".composer strong")).toHaveText("How was the run?");
  await expect(page.locator(".post-card .side-tag").first()).toHaveText("Runners");
  // The side's home sits at the top of its feed: who is in, how much is there, and its plans.
  const home = page.getByRole("region", { name: "Runners home" });
  await expect(home.getByRole("heading", { name: "Runners" })).toBeVisible();
  await expect(home.locator(".side-home-meta")).toContainText("4 members");
  await expect(
    home.getByRole("list", { name: "People in Runners" }).getByRole("button"),
  ).toHaveCount(4);
  await expect(home.getByRole("button", { name: /^Track night/ })).toContainText("2 in");
  // Who comes most often, across the side's past weeks (ADR 0034).
  const regulars = home.getByRole("list", { name: "Regulars in Runners" }).getByRole("button");
  await expect(regulars).toHaveCount(4);
  await expect(regulars.first()).toContainText("Maya");
  await expect(regulars.first()).toContainText("3 times");
  await expect(regulars.last()).toContainText("Alex Morgan");
  // Specs that ran before may have put Alex into more plans; how often he came is stable.
  await expect(regulars.last()).toContainText("once");
  // Opening a side from the Sides tab lands on that home.
  await bar.getByRole("button", { name: "Everyday" }).click();
  await expect(page.getByRole("region", { name: "Runners home" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Join or leave sides" }).click();
  await page.getByRole("button", { name: "Open Runners" }).click();
  await expect(page.getByRole("region", { name: "Runners home" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Runners" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Leo's private festival side is not offered, and its post is not found by search.
  await bar.getByRole("button", { name: "Join or leave sides" }).click();
  const sidesPage = page.getByRole("region", { name: "Your sides" });
  await expect(sidesPage.getByRole("heading", { name: "Your sides" })).toBeVisible();
  await expect(sidesPage.getByText("Film Festival crew")).toHaveCount(0);
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  await page.getByLabel("Search all posts").fill("jury notes");
  await expect(page.getByText("Looking around…")).toHaveCount(0);
  await expect(page.getByRole("article", { name: /^Jury notes/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).first().click();

  // A post made inside Runners carries the side, and is not in Everyday until shared.
  await page
    .getByRole("button", { name: "Create a post" })
    .filter({ visible: true })
    .first()
    .click();
  const pick = page.getByRole("dialog", { name: "Pick a post style" });
  await pick.getByRole("button", { name: "Use this style" }).click();
  const editor = page.getByRole("dialog", { name: "Edit your post" });
  await expect(editor.getByText("Posting to Runners")).toBeVisible();
  await editor.getByRole("button", { name: "Publish" }).click();
  const mine = page.getByRole("article", { name: /^The city glows after rain/ }).first();
  await expect(mine).toHaveCount(1);
  await expect(mine.locator(".side-tag")).toHaveText("Runners");

  await bar.getByRole("button", { name: "Everyday" }).click();
  await expect(page.getByRole("article", { name: /^Saturday, up top/ })).toHaveCount(1);
  await expect(page.getByRole("article", { name: /^The city glows after rain/ })).toHaveCount(0);

  await bar.getByRole("button", { name: "Runners" }).click();
  await mine.scrollIntoViewIfNeeded();
  await mine.getByRole("button", { name: /^Options for/ }).click();
  await page.getByRole("button", { name: "Also show in Everyday" }).click();
  await expect(page.locator(".toast")).toContainText("Now also in Everyday");
  await bar.getByRole("button", { name: "Everyday" }).click();
  const shared = page.getByRole("article", { name: /^The city glows after rain/ }).first();
  await expect(shared).toHaveCount(1);
  await expect(shared.locator(".side-tag")).toHaveClass(/shared/);
});

test("an open side is joined from the Sides tab and lands on its home", async ({ page }) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const bar = page.getByRole("navigation", { name: "Your sides" });
  await expect(bar.getByRole("button", { name: "Gamers" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Join or leave sides" }).click();
  const sidesPage = page.getByRole("region", { name: "Your sides" });
  await sidesPage
    .locator(".side-row")
    .filter({ hasText: "Gamers" })
    .getByRole("button", { name: "Join" })
    .click();
  await expect(page.locator(".toast")).toContainText("You're in Gamers.");
  await sidesPage.getByRole("button", { name: "Open Gamers" }).click();
  const home = page.getByRole("region", { name: "Gamers home" });
  await expect(home.getByRole("heading", { name: "Gamers" })).toBeVisible();
  await expect(home.locator(".side-home-meta")).toContainText("5 members");
  await expect(home.locator(".side-home-meta")).toContainText("3 posts");
  await expect(home.getByRole("button", { name: /^Squad up/ })).toContainText("2 in · 1 came");
  await expect(page.locator(".composer strong")).toHaveText("What are you playing tonight?");
  await expect(page.getByRole("article", { name: /^Weekend cup/ })).toHaveCount(1);
  await home.getByRole("button", { name: "Leave Gamers" }).click();
  await expect(page.locator(".toast")).toContainText("You left Gamers.");
  await expect(bar.getByRole("button", { name: "Everyday" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a side is found by search, has an invite link, and its link opens its home without an account", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  // Search: every word of the query is in the side's name or tagline (ADR 0035).
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  const search = page.getByLabel("Search all posts");
  await search.fill("race days");
  const found = page.getByRole("region", { name: "Sides" });
  await expect(found.locator(".side-row")).toHaveCount(1);
  await expect(found).toContainText("Runners");
  await search.fill("squad");
  await expect(found.locator(".side-row")).toHaveCount(1);
  await expect(found).toContainText("Gamers");
  await expect(found.getByRole("button", { name: "Join" })).toBeVisible();
  await search.fill("nothing like this");
  await expect(found).toHaveCount(0);
  await search.fill("runners");
  await found.getByRole("button", { name: "Open", exact: true }).click();
  const home = page.getByRole("region", { name: "Runners home" });
  await expect(home).toBeVisible();
  // The invite link, for a chat group; without a share sheet it goes to the clipboard.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await home.getByRole("button", { name: "Invite link for Runners" }).click();
  await expect(page.locator(".toast")).toContainText("/s/runners");

  // A guest who taps the link sees the side's home and one way in; a private side does not exist.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto("/s/runners");
  await expect(guest).toHaveTitle(/Runners on Smudge/);
  const shared = guest.getByRole("region", { name: "Runners home" });
  await expect(shared.getByRole("heading", { name: "Runners" })).toBeVisible();
  await expect(shared.locator(".side-home-meta")).toContainText("4 members");
  await expect(shared.getByRole("link", { name: /^Track night/ })).toContainText("in");
  await expect(
    shared.getByRole("list", { name: "Regulars in Runners" }).getByRole("link").first(),
  ).toContainText("Maya");
  await expect(guest.getByRole("link", { name: "Join Runners on Smudge" })).toHaveAttribute(
    "href",
    "/?side=runners",
  );
  await expect(guest.getByRole("list", { name: "Posts" }).getByRole("link").first()).toBeVisible();
  const anonymous = await guest.evaluate(() =>
    fetch("/api/sides/runners/home").then((r) => r.status),
  );
  expect(anonymous).toBe(401);
  await guest.goto("/s/film-fest");
  await expect(guest.getByRole("heading", { name: "This side isn’t available." })).toBeVisible();
  await guestContext.close();
  // A member who opens the link lands inside the side in the app.
  await page.goto("/s/runners");
  await expect(
    page.getByRole("navigation", { name: "Your sides" }).getByRole("button", { name: "Runners" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page).not.toHaveURL(/side=/);
});
