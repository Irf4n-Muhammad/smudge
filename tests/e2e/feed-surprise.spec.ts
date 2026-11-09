import { test, expect } from "@playwright/test";

test("a surprise card between feed posts tells you what a friend just did, and opens it", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  // The demo: Maya made her version of one of Alex's posts a few hours ago.
  const card = page.getByRole("button", { name: /^Maya made their version of your “/ });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("h ago");
  // It sits after a run of posts, not at the top of the feed.
  const before = await card.evaluate((el) => {
    let n = 0;
    for (let e = el.previousElementSibling; e; e = e.previousElementSibling)
      if (e.matches(".post-card")) n++;
    return n;
  });
  expect(before).toBe(5);
  await card.click();
  await expect(page).toHaveURL(/\?post=/);
  await expect(
    page.getByRole("article", { name: /^My take, same idea by Maya Chen/ }),
  ).toBeVisible();
});
