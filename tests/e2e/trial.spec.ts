import { test, expect } from "@playwright/test";

test("the trial page shows a moderator the counts for a post and an organisation", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const feed = (await page.evaluate(async () => (await fetch("/api/feed")).json())) as {
    id: string;
    metadata: { title: string };
    remix?: unknown;
  }[];
  const list = feed.find((p) => p.metadata.title === "Street food tier list" && !p.remix)!;
  // Two opens of the public link and one of the organisation page.
  await page.evaluate(
    async ({ id }) => {
      await fetch(`/api/public/posts/${id}`);
      await fetch(`/api/public/posts/${id}`);
      await fetch("/api/public/orgs/teater-senja");
    },
    { id: list.id },
  );
  await page.goto(`/trial?post=${list.id}&org=teater-senja`);
  const post = page.getByRole("region", { name: "Post Street food tier list" });
  await expect(post).toContainText("Opened from a link2");
  await expect(post).toContainText("Played to the end, with an account");
  await expect(page.getByRole("region", { name: "Organisation teater-senja" })).toContainText(
    "Joined from the link",
  );
  await page.screenshot({ path: "test-results/trial.png" });

  // Anyone else gets nothing.
  await page.evaluate(() =>
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "maya" }),
    }),
  );
  const status = await page.evaluate(
    async () => (await fetch("/api/trial?org=teater-senja")).status,
  );
  expect(status).toBe(403);
});
