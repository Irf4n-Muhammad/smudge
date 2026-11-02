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

test("a student society starts itself on Smudge and members join from one link", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await as(page, "dani");
  await page.goto("/o/new");
  await page.getByLabel("Name").fill("Lembayung Design Society");
  await page.getByLabel("First term").fill("2026/27");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: "Lembayung Design Society" })).toBeVisible();
  await expect(page.locator(".org-terms li.open")).toHaveText(/2026\/27/);
  const manage = page.getByRole("region", { name: "Manage" });
  await manage.getByRole("button", { name: "Get join link" }).click();
  const link = await manage.getByLabel("Join link").inputValue();
  expect(link).toMatch(/\/o\/lembayung-design-society[\w-]*\?join=[A-Z0-9]{10}$/);

  await as(page, "maya");
  await page.goto(link);
  const join = page.getByRole("region", { name: "Join" });
  await expect(join).toContainText("Member, Lembayung Design Society 2026/27");
  await page.screenshot({ path: "test-results/org-join.png" });
  await join.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("status")).toContainText("You joined.");
  await expect(page.locator(".org-hero")).toContainText("1 person");
  await expect(page).not.toHaveURL(/join=/);
});

test("a term's room: the admin pins what's true now, members talk, outsiders see nothing", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await as(page, "ines");
  await page.goto("/o/new");
  await page.getByLabel("Name").fill("Senja Photography Club");
  await page.getByLabel("First term").fill("2026/27");
  await page.getByRole("button", { name: "Start" }).click();
  const room = page.getByRole("region", { name: "Room" });
  await expect(room).toContainText("Nothing scheduled or decided yet.");
  await room.getByLabel("Add to the top").selectOption("deadline");
  await room.getByLabel("What").fill("Contest photos due");
  await room.getByLabel("When").fill("2026-11-20");
  await room.getByRole("button", { name: "Add" }).click();
  await expect(room.locator(".org-state")).toContainText("Contest photos due");
  await room.getByLabel("Message").fill("Photo walk Saturday 6am, Old Town.");
  await room.getByLabel("Announce").check();
  await room.getByRole("button", { name: "Send" }).click();
  await expect(room.getByRole("region", { name: "Announcements" })).toContainText("Photo walk");
  const manage = page.getByRole("region", { name: "Manage" });
  await manage.getByRole("button", { name: "Get join link" }).click();
  const link = await manage.getByLabel("Join link").inputValue();
  const orgPath = new URL(link).pathname;

  // Leo hasn't joined: the page is public, the room isn't.
  await as(page, "leo");
  await page.goto(orgPath);
  await expect(page.getByRole("heading", { name: "Senja Photography Club" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Room" })).toHaveCount(0);

  // Maya joins from the link and the room opens with what she missed on top.
  await as(page, "maya");
  await page.goto(link);
  await page.getByRole("region", { name: "Join" }).getByRole("button", { name: "Join" }).click();
  const hers = page.getByRole("region", { name: "Room" });
  await expect(hers.locator(".org-state")).toContainText("Contest photos due");
  await expect(hers).toContainText("Photo walk Saturday");
  await expect(hers.getByLabel("Announce", { exact: true })).toHaveCount(0);
  await hers.getByLabel("Message").fill("I'm in! Bringing the 50mm.");
  await hers.getByRole("button", { name: "Send" }).click();
  await expect(hers.getByRole("list", { name: "Conversation" })).toContainText(
    "I'm in! Bringing the 50mm.",
  );
  await page.screenshot({ path: "test-results/org-room.png", fullPage: true });
});
