import { test, expect } from "@playwright/test";

test("a tier list: tap each item into a tier, then see who agrees and where you'd fight", async ({
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
  expect(list).toBeTruthy();
  await page.evaluate(() =>
    fetch("/api/users/maya/follow", { method: "POST" }).then(async (r) => {
      // Following is a toggle; make sure Alex ends up following Maya.
      const boot = await (await fetch("/api/bootstrap")).json();
      if (!boot.following.includes("maya"))
        await fetch("/api/users/maya/follow", { method: "POST" });
      return r.status;
    }),
  );

  await page.goto(`/?post=${list.id}`);
  const card = page.locator(".post-card").first();
  const frame = card.locator("iframe").contentFrame();
  await expect(frame.locator("h1")).toHaveText("My street food tier list. Fight me.");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/tier-cover.png" });
  await frame.getByRole("button", { name: "Rank ▸" }).click();
  await expect(frame.getByText("1 of 6")).toBeVisible();
  await expect(frame.locator(".item")).toHaveText("🥞 Martabak manis");
  await page.screenshot({ path: "test-results/tier-one-item.png" });
  for (const tier of ["S", "S", "B", "A", "S", "C"])
    await frame.getByRole("button", { name: tier, exact: true }).click();

  // The end: your list beside the maker's and a friend's, with the biggest disagreement named.
  await expect(frame.locator(".board .line")).toHaveCount(4);
  await expect(frame.locator(".vs")).toContainText("Maya (who made it) agrees on 3 of 6");
  await expect(frame.locator(".vs")).toContainText("Fight: 🌶️ Seblak (S vs C)");
  await expect(frame.locator(".vs")).toContainText("Leo agrees on 5 of 6");
  await page.screenshot({ path: "test-results/tier-end.png" });
  await expect(card.locator(".friend-answers")).toContainText("You");
});
