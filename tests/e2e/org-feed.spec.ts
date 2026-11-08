import { test, expect, type Page } from "@playwright/test";

const as = (page: Page, userId: string) =>
  page.evaluate(
    (userId) =>
      fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).then((r) => r.status),
    userId,
  );

test("an organisation you follow posts in your feed, and its ticket and recruitment work right there", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const tickets = page.locator(".org-feed-card", { hasText: "Opening night is set" });
  await expect(tickets).toContainText("Organisation you follow");
  await expect(tickets).toContainText("Paper House, opening night");
  await tickets.getByRole("button", { name: /Get a ticket · Free/ }).click();
  await expect(tickets).toContainText("You’re going.");

  const oprec = page.locator(".org-feed-card", { hasText: "We need hands for Paper House" });
  await oprec.getByRole("button", { name: "Apply here" }).click();
  await oprec.getByLabel("Division").selectOption("Lighting");
  await oprec.getByLabel("Which evenings can you do?").fill("Tuesdays");
  await oprec.getByRole("button", { name: "Send application" }).click();
  await expect(oprec).toContainText("You applied for Lighting.");
  await oprec.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/org-feed-applied.png" });

  // The page says Alex follows it; unfollowing takes its posts out of the feed.
  await page.goto("/o/teater-senja");
  await page.getByRole("button", { name: "Following" }).click();
  await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeVisible();
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await expect(page.locator(".org-feed-card")).toHaveCount(0);
  await page.goto("/o/teater-senja");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Following Teater Senja");
});

test("an organisation sits in Messages with its rooms; a division talks in its own room", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await as(page, "dani");
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Messages/ })
    .first()
    .click();
  const row = page.locator(".org-conversation", { hasText: "Teater Senja" });
  await expect(row.locator(".org-chat-rooms")).toContainText("Costume");
  // Dani is in Costume, not Stage crew; only the people who run the term see every division.
  await expect(row.locator(".org-chat-rooms")).not.toContainText("Stage crew");
  await row
    .locator(".org-chat-rooms")
    .getByRole("link", { name: /Costume/ })
    .click();
  const talk = page.getByRole("dialog", { name: "Talk" });
  await expect(talk.getByRole("heading", { name: "Costume" })).toBeVisible();
  await expect(talk).toContainText("Fabric for the act 2 dresses came in.");
  await talk.getByPlaceholder("Say something to Costume").fill("Measuring tape is in the box");
  await talk.getByRole("button", { name: "Send" }).click();
  await expect(talk).toContainText("Measuring tape is in the box");
  // The everyone room doesn't show the division's talk.
  await talk.getByRole("button", { name: "Everyone" }).click();
  await expect(talk.getByRole("heading", { name: "Talk" })).toBeVisible();
  await expect(talk).not.toContainText("Measuring tape is in the box");
  await page.screenshot({ path: "test-results/org-division-room.png" });
});

test("today's format leads Home, and the Valentine's No runs away", async ({ page }) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await as(page, "you");
  await page.goto("/");
  const ribbon = page.getByRole("region", { name: "Today’s format" });
  await expect(ribbon).toBeVisible();
  await expect(page.locator(".post-list > *").first()).toHaveClass(/today-block/);

  const feed = (await page.evaluate(async () => (await fetch("/api/feed")).json())) as {
    id: string;
    metadata: { title: string };
  }[];
  const valentine = feed.find((p) => p.metadata.title === "Will you be my Valentine?")!;
  await page.goto(`/?post=${valentine.id}`);
  const card = page.locator(".post-card").first();
  const frame = card.locator("iframe").contentFrame();
  const no = frame.getByRole("button", { name: "No" });
  const before = await no.boundingBox();
  await no.hover();
  await expect.poll(async () => (await no.boundingBox())?.x).not.toBe(before?.x);
  await frame.getByRole("button", { name: "Yes" }).click();
  await expect(frame.locator("#done")).toBeVisible();
  await expect(frame.locator("#who")).toContainText("said yes");
});
