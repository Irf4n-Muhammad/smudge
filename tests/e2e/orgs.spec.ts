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

test("an organisation's page: public terms for anyone, and its admin starts a term and hands over", async ({
  page,
  browser,
}) => {
  // Anyone can open the page without an account; the past term is locked, the current one open.
  const guestContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const guest = await guestContext.newPage();
  await guest.goto("/o/teater-senja");
  await expect(guest.getByRole("heading", { name: "Teater Senja" })).toBeVisible();
  const terms = guest.getByRole("region", { name: "Terms" });
  await expect(terms.locator("li.open")).toHaveText(/2025\/26/);
  await expect(terms.locator("li.locked")).toHaveText(/2024\/25/);
  await expect(guest.getByRole("region", { name: "Manage" })).toHaveCount(0);
  await guest.screenshot({ path: "test-results/org-public.png" });
  await guestContext.close();

  // Maya runs it: she starts the next term, which locks this one.
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await as(page, "maya");
  await page.goto("/o/teater-senja");
  const manage = page.getByRole("region", { name: "Manage" });
  await expect(manage).toContainText("Run by @mayainframes");
  await manage.getByLabel("New term").fill("2026/27");
  await manage.getByRole("button", { name: "Start term" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Term 2026/27 started. The last one is locked.",
  );
  await expect(page.locator(".org-terms li.open")).toHaveText(/2026\/27/);
  await expect(page.locator(".org-terms li.locked")).toHaveCount(2);
  await page.screenshot({ path: "test-results/org-admin.png" });

  // She hands it to Leo without sharing a password, and keeps a chapter for her term.
  page.once("dialog", (d) => d.accept());
  await manage.getByLabel("Hand over to").fill("@leopark");
  await manage.getByLabel("Your role, for your chapter").fill("Ketua");
  await manage.getByRole("button", { name: "Hand over" }).click();
  await expect(page.getByRole("status")).toContainText("Handed over to @leopark");
  await expect(page.getByRole("region", { name: "Manage" })).toHaveCount(0);
  const chapters = await page.evaluate(() =>
    fetch("/api/users/maya/chapters").then((r) => r.json()),
  );
  expect(chapters.map((c: { label: string }) => c.label)).toContain("Ketua, Teater Senja 2026/27");

  await as(page, "leo");
  await page.goto("/o/teater-senja");
  await expect(page.getByRole("region", { name: "Manage" })).toContainText("Run by @leopark");
});
