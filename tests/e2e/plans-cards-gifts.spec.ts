import { test, expect } from "@playwright/test";
import { openMore, openPeople, pickFeed } from "./nav";

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

test("a plan post is joined with one tap inside the post, and a new one is made in the editor", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await page
    .getByRole("navigation", { name: "Your sides" })
    .getByRole("button", { name: "Runners" })
    .click();
  const track = page.getByRole("article", { name: /^Track night/ });
  await expect(track).toHaveCount(1);
  const inside = track.frameLocator("iframe");
  await expect(inside.locator("[data-plan-count]")).toHaveText("2");
  // The snap feed can still be settling the card when the first tap lands; tap again if so.
  await expect(async () => {
    await inside.getByRole("button", { name: "I'm in" }).click();
    await expect(inside.locator("[data-plan-count]")).toHaveText("3", { timeout: 4000 });
  }).toPass({ timeout: 20000 });
  await expect(inside.locator("[data-plan-names]")).toContainText("Alex Morgan");
  await expect(inside.locator("[data-plan-names]")).toContainText("you're in");
  // Being in unlocks "I was there": who actually came is kept apart from who said they'd come.
  await inside.getByRole("button", { name: "I was there", exact: true }).click();
  await expect(inside.locator("[data-plan-came-label]")).toHaveText("· 1 came");
  await expect(inside.getByRole("button", { name: "I was there ✓" })).toBeVisible();
  await expect(inside.locator(".face.there")).toHaveCount(1);
  await inside.getByRole("button", { name: "I'm out" }).click();
  await expect(inside.locator("[data-plan-count]")).toHaveText("2");
  await expect(inside.locator("[data-plan-came-label]")).toHaveText("");
  await expect(inside.getByRole("button", { name: /I was there/ })).toBeHidden();

  // A new plan from the editor: the style declares the permission, so the button works at once.
  await page
    .getByRole("button", { name: "Create a post" })
    .filter({ visible: true })
    .first()
    .click();
  const pick = page.getByRole("dialog", { name: "Pick a post style" });
  await pick.getByRole("option", { name: "Plan" }).click();
  await expect(pick).toContainText("Invite people and see who's in");
  await pick.getByRole("button", { name: "Use this style" }).click();
  const editor = page.getByRole("dialog", { name: "Edit your post" });
  const frame = editor.locator(".easy-layer.shown iframe").contentFrame();
  await expect(frame.locator("h1")).toContainText("Long run, who's in?");
  await expect(frame.getByRole("button", { name: "I'm in" })).toBeVisible();
  await editor.getByRole("button", { name: "Publish" }).click();
  const mine = page.getByRole("article", { name: /^Long run, who's in/ });
  await expect(mine).toHaveCount(1);
  const box = mine.frameLocator("iframe");
  await box.getByRole("button", { name: "I'm in" }).click();
  await expect(box.locator("[data-plan-count]")).toHaveText("1");
});

test("a share card is drawn for a side, and its link lands inside that side", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const bar = page.getByRole("navigation", { name: "Your sides" });
  await bar.getByRole("button", { name: "Join or leave sides" }).click();
  await page.getByRole("button", { name: "Share card for Runners" }).click();
  const dialog = page.getByRole("dialog", { name: "Share card" });
  const image = dialog.getByRole("img", { name: "Your Runners card" });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(dialog).toContainText("/u/alex?side=runners");
  await page.keyboard.press("Escape");

  // A guest who taps the link sees the side named; a member lands in it.
  const guest = await browser.newContext();
  const landing = await guest.newPage();
  await landing.goto("/u/alex?side=runners");
  await expect(landing.getByRole("heading", { name: "Join Alex Morgan in Runners" })).toBeVisible();
  await guest.close();
  await page.goto("/?side=runners");
  await expect(bar.getByRole("button", { name: "Runners" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page).not.toHaveURL(/side=/);
});

test("a market theme arrives as a gift with a note and can be worn; proof themes cannot be given", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await openMore(page, "Themes");
  const gifts = page.getByRole("region", { name: "Gifts for you" });
  await expect(gifts).toContainText("Maya Chen gave you Cat peek");
  await expect(gifts).toContainText("finally finishing the 21K");
  await gifts.getByRole("button", { name: "Wear it" }).click();
  await expect(gifts).toContainText("Wearing it");

  await page
    .getByRole("article", { name: "Theme Vines" })
    .getByRole("button", { name: "Preview Vines" })
    .click();
  const preview = page.getByRole("dialog", { name: "Vines" });
  await preview.getByRole("button", { name: "Give as a gift" }).click();
  const form = preview.getByRole("form", { name: "Give this theme" });
  await form.getByLabel("For").selectOption({ label: "Maya Chen" });
  await form.getByLabel("A note").fill("For the next long run");
  await form.getByRole("button", { name: "Send the gift" }).click();
  await expect(page.locator(".toast")).toContainText("Sent to Maya Chen");
  await page.keyboard.press("Escape");
  await page
    .getByRole("article", { name: "Theme Finisher medal" })
    .getByRole("button", { name: "Preview Finisher medal" })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Finisher medal" })
      .getByRole("button", { name: "Give as a gift" }),
  ).toHaveCount(0);
});
