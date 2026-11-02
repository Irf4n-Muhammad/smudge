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

test("open recruitment: open it, apply with your profile, share the twibbon, get accepted into the room", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await as(page, "dani");
  await page.goto("/o/new");
  await page.getByLabel("Name").fill("Lembayung Student Union");
  await page.getByLabel("First term").fill("2026/27");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: "Lembayung Student Union" })).toBeVisible();
  const orgPath = new URL(page.url()).pathname;

  await page.getByRole("button", { name: "Edit page" }).click();
  const open = page.getByRole("region", { name: "Recruitment" });
  await open.getByLabel("Title").fill("Orientation Week Crew 2026");
  await open.getByLabel("Divisions, separated by commas").fill("Events, Comms, Logistics");
  await open.getByLabel("Questions, one per line (up to 5)").fill("Why do you want to join?");
  await open.getByRole("button", { name: "Open recruitment" }).click();
  await expect(page.getByRole("region", { name: "Open recruitment" })).toContainText(
    "Orientation Week Crew 2026",
  );

  // Maya applies with her profile: one choice and one answer, nothing retyped.
  await as(page, "maya");
  await page.goto(orgPath);
  const oprec = page.getByRole("region", { name: "Open recruitment" });
  await expect(oprec).toContainText("0 people applied");
  await page.screenshot({ path: "test-results/oprec-open.png", fullPage: true });
  await oprec.getByLabel("Division").selectOption("Events");
  await oprec.getByLabel("Why do you want to join?").fill("I ran events for my theatre club.");
  await oprec.getByRole("button", { name: "Apply" }).click();
  await expect(oprec).toContainText("You applied for Events");
  const download = page.waitForEvent("download");
  await oprec.getByRole("button", { name: "Share to story" }).click();
  await (await download).saveAs("test-results/oprec-story.png");
  await expect(page.getByRole("tab", { name: "Backstage" })).toHaveCount(0);

  // The committee reads her proven chapters and accepts.
  await as(page, "dani");
  await page.goto(orgPath);
  await page.getByRole("button", { name: "Edit page" }).click();
  const applicants = page.getByRole("region", { name: "Applicants" });
  await expect(applicants).toContainText("Maya");
  await expect(applicants).toContainText("I ran events for my theatre club.");
  await expect(applicants).toContainText("Member, Teater Senja");
  await page.screenshot({ path: "test-results/oprec-applicants.png", fullPage: true });
  await applicants.getByRole("button", { name: "Accept" }).click();
  await expect(applicants).toContainText("accepted");

  // Accepted: the chapter is on her page and the term's room is open to her.
  await as(page, "maya");
  await page.goto(orgPath);
  await expect(page.getByRole("region", { name: "Open recruitment" })).toContainText(
    "You’re in: Events",
  );
  await page.getByRole("tab", { name: "Backstage" }).click();
  await expect(page.getByRole("region", { name: "Room" })).toBeVisible();
  const chapters = await page.evaluate(() =>
    fetch("/api/users/maya/chapters").then((r) => r.json()),
  );
  expect(chapters.map((c: { label: string }) => c.label)).toContain(
    "Events, Lembayung Student Union 2026/27",
  );
});
