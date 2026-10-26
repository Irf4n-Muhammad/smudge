import { test, expect } from "@playwright/test";

test("the first screen shows what friends are up to, and a widget page shows one friend live", async ({
  page,
  browser,
}) => {
  // Alex notes something; Leo follows Alex.
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const text = "sketching at the station " + Date.now().toString(36);
  const added = await page.evaluate(
    (text) =>
      fetch("/api/me/now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "doing", text }),
      }).then((r) => r.status),
    text,
  );
  expect(added).toBe(200);
  await page.evaluate(() =>
    fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "leo" }),
    }),
  );
  await page.goto("/");
  const row = page.getByRole("region", { name: "Friends right now" });
  const tile = row.getByRole("button", { name: `Alex Morgan: ${text}` });
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page.getByRole("region", { name: "What they're up to" })).toContainText(text);

  // The widget page is one friend, live, without an account.
  const guestContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const guest = await guestContext.newPage();
  await guest.goto("/w/alex");
  const widget = guest.locator(".widget");
  await expect(widget).toContainText("Alex Morgan");
  await expect(widget.locator(".widget-now")).toContainText(text);
  await expect(widget).toHaveAttribute("href", "/u/alex");
  await guestContext.close();
});
