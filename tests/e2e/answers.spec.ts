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

test("a guest plays a shared quiz, then comes in and sees their score next to their friends'", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const as = (userId: string) => call(page, "POST", "/session", { userId });
  await as("you");
  const feed = (await call(page, "GET", "/feed")).body as {
    id: string;
    metadata: { title: string };
    remix?: unknown;
  }[];
  const quiz = feed.find((p) => p.metadata.title === "Guess the song from emoji" && !p.remix)!;
  // Maya, whom Alex follows, already played and got all three.
  await as("maya");
  const maya = await call(page, "POST", `/posts/${quiz.id}/claim`, {
    answer: { score: 3, of: 3 },
  });
  expect(maya.status).toBe(200);
  await as("you");
  await call(page, "POST", `/users/maya/follow`, {});
  const following = (await call(page, "GET", "/bootstrap")).body.following as string[];
  if (!following.includes("maya")) await call(page, "POST", `/users/maya/follow`, {});
  // Alex does not follow Leo yet, so playing his post ends with an offer to.
  if (following.includes("leo")) await call(page, "POST", `/users/leo/follow`, {});

  // A stranger opens the link from a story: no account, the quiz still plays.
  const guestContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const guest = await guestContext.newPage();
  await guest.goto(`/p/${quiz.id}`);
  const frame = guest.locator(".share-post iframe").contentFrame();
  // The first frame is Leo's challenge; the answers show up after a tap.
  await expect(frame.locator("h1")).toHaveText(/most played songs/);
  await guest.waitForTimeout(500);
  await guest.screenshot({ path: "test-results/quiz-cover.png" });
  await frame.getByRole("button", { name: "Guess ▸" }).click();
  await expect(frame.locator("#clue")).toHaveText("☔️🎤💃");
  await guest.waitForTimeout(400);
  await guest.screenshot({ path: "test-results/quiz-one-clue.png" });
  await frame.getByRole("button", { name: "Singin' in the Rain" }).click();
  await guest.waitForTimeout(250);
  await guest.screenshot({ path: "test-results/quiz-tap.png" });
  await frame.getByRole("button", { name: "Let It Go" }).click();
  await frame.getByRole("button", { name: "Octopus's Garden" }).click();
  await expect(frame.locator("#score")).toHaveText("1 / 3");
  const invite = guest.getByRole("link", { name: "See my friends’ answers" });
  await expect(invite).toBeVisible();
  await guest.screenshot({ path: "test-results/answers-guest.png" });

  // Coming in lands back on the same post, with the guest's score kept beside Maya's.
  await invite.click();
  await expect(guest).toHaveURL(new RegExp(`\\?post=${quiz.id}`));
  const line = guest.locator(".post-card").first().locator(".friend-answers");
  await expect(line).toContainText("You 1/3");
  await expect(line).toContainText("3/3");
  await expect(line).toContainText("People who follow you see your answer.");
  await guest.screenshot({ path: "test-results/answers-friends.png" });
  const offer = line.locator(".answer-follow");
  await expect(offer).toContainText("Follow Leo to get their next one.");
  await offer.scrollIntoViewIfNeeded();
  await guest.screenshot({ path: "test-results/answers-follow-offer.png" });
  await offer.getByRole("button", { name: "Follow" }).click();
  await expect(offer).toHaveCount(0);
  // The answer moved to the account, so nothing is left waiting in the browser.
  expect(await guest.evaluate((id) => localStorage.getItem(`smudge-guest:${id}`), quiz.id)).toBe(
    null,
  );
  await guestContext.close();

  // Leo hears who played his quiz and how they did, and can follow them from there.
  await as("leo");
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true })
    .first()
    .click();
  const played = page.locator(".notification").filter({ hasText: "Alex Morgan played" });
  await expect(played).toContainText("played “Guess the song from emoji”: 1/3.");
  await page.screenshot({ path: "test-results/answers-notification.png" });

  // A post that does not take answers drops a claimed answer instead of storing it.
  const plain = feed.find((p) => p.metadata.title === "Saturday, up top");
  if (plain) {
    const res = await call(page, "POST", `/posts/${plain.id}/claim`, { answer: { pick: "x" } });
    expect(res.body.count).toBe(0);
  }
});
