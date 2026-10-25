import { test, expect } from "@playwright/test";

test("one tap on your own page notes what you are up to, piles into an archive, and shows to guests", async ({
  page,
  browser,
}) => {
  await page.goto("/?profile=you");
  const bar = page.getByRole("region", { name: "Right now" });
  await expect(bar.getByRole("button", { name: "Listening" })).toBeVisible();
  const stamp = Date.now().toString(36);
  const song = "Velvet Static " + stamp,
    doing = "on the train " + stamp;
  await bar.getByRole("button", { name: "Listening" }).click();
  await bar.getByLabel("Song").fill(song);
  await bar.getByLabel("Artist").fill("After Hours");
  await bar.getByRole("button", { name: "Save" }).click();
  await expect(bar.locator(".now-current")).toContainText(song);
  await expect(bar.locator(".now-current")).toContainText("After Hours");
  await bar.getByRole("button", { name: "Doing" }).click();
  await bar.getByLabel("What are you up to?").fill(doing);
  await bar.getByRole("button", { name: "Save" }).click();
  await expect(bar.locator(".now-current")).toContainText(doing);
  await bar.getByRole("button", { name: /^Archive · \d+/ }).click();
  const archive = bar.getByRole("list", { name: "Archive" });
  await expect(archive).toContainText(song);
  await expect(archive).toContainText(doing);

  // The owner can take an entry back; the earlier one becomes current again.
  await archive
    .locator("li")
    .filter({ hasText: doing })
    .getByRole("button", { name: "Remove this entry" })
    .click();
  await expect(bar.locator(".now-current")).toContainText(song);

  // The share link shows it to someone without an account.
  const guestContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const guest = await guestContext.newPage();
  await guest.goto("/u/alex");
  const theirs = guest.getByRole("region", { name: "What they're up to" });
  await expect(theirs.locator(".now-current")).toContainText(song);
  await expect(theirs.getByRole("button", { name: "Doing" })).toHaveCount(0);
  await guestContext.close();
});

test("five answers after signing up become a published page", async ({ page }) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const handle = "setup" + Date.now().toString(36);
  await page.getByRole("button", { name: "Create an account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Setup Tester");
  await dialog.getByLabel("Handle").fill(handle);
  await dialog.getByLabel("Email", { exact: true }).fill(`${handle}@mail.example`);
  await dialog.getByLabel("Password").fill("a long enough phrase");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  const setup = page.getByRole("dialog", { name: /^Welcome/ });
  await setup.getByRole("button", { name: "Next" }).click();
  await setup.getByLabel("One line about you").fill("Drawing people on trains");
  await setup.getByRole("button", { name: "Next" }).click();
  await setup.getByRole("radio", { name: /Paint wall/ }).click();
  await setup.getByRole("button", { name: "Next" }).click();
  await setup.getByRole("radio", { name: "Ocean" }).click();
  await setup.getByRole("button", { name: "Next" }).click();
  await setup.getByLabel("Song").fill("Velvet Static");
  await setup.getByLabel("Artist").fill("After Hours");
  await setup.getByLabel("What are you up to?").fill("on the train");
  await setup.getByRole("button", { name: "Make my page" }).click();
  await expect(setup).toHaveCount(0);

  // The page is up, with the line and the first two entries, and it opens without an account.
  const bar = page.getByRole("region", { name: "Right now" });
  await expect(bar.locator(".now-current")).toContainText("on the train");
  await expect(bar.getByRole("button", { name: "Archive · 2" })).toBeVisible();
  await expect(page.locator(".profile-page.profile-illustrated")).toBeVisible();
  const frame = page.locator(".profile-page iframe").first().contentFrame();
  await expect(frame.locator("#giant-line")).toHaveText("Drawing people on trains");
  await expect(frame.getByText("Velvet Static")).toBeVisible();
  const status = await page.evaluate(
    (h) => fetch(`/api/public/users/${h}`).then((r) => r.json()),
    handle,
  );
  expect(status.user.bio).toBe("Drawing people on trains");
  expect(status.profile).not.toBeNull();
});
