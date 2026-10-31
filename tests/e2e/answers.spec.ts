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

  // A stranger opens the link from a story: no account, the quiz still plays.
  const guestContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const guest = await guestContext.newPage();
  await guest.goto(`/p/${quiz.id}`);
  const frame = guest.locator(".share-post iframe").contentFrame();
  await frame.locator('input[name="a1"]').fill("singin in the rain");
  await frame.getByRole("button", { name: "Check my answers" }).click();
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
  // The answer moved to the account, so nothing is left waiting in the browser.
  expect(await guest.evaluate((id) => localStorage.getItem(`smudge-guest:${id}`), quiz.id)).toBe(
    null,
  );
  await guestContext.close();

  // A post that does not take answers drops a claimed answer instead of storing it.
  const plain = feed.find((p) => p.metadata.title === "Saturday, up top");
  if (plain) {
    const res = await call(page, "POST", `/posts/${plain.id}/claim`, { answer: { pick: "x" } });
    expect(res.body.count).toBe(0);
  }
});
