import { test, expect } from "@playwright/test";

test("a finisher enters the organiser's stamp code: the collection shows the gap and the race theme opens", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  const medal = page.getByRole("article", { name: "Theme Finisher medal" });
  await expect(medal).toContainText("Locked");
  await medal.getByRole("button", { name: "Preview Finisher medal" }).click();
  await expect(page.getByRole("dialog", { name: "Finisher medal" })).toContainText(
    "Finishers of Borobudur Marathon",
  );
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Who you are", exact: true }).click();
  await page.getByRole("button", { name: "Invite code" }).click();
  await page.getByLabel(/Invite code from/).fill("BORO2026OK");
  await page.getByRole("button", { name: "Redeem" }).click();
  await expect(page.locator(".toast")).toContainText("Finisher, Borobudur Marathon 2026");
  const collection = page.getByRole("article", { name: "Indonesian Marathon Series 2026" });
  await expect(collection).toContainText("1 of 5 stamps");
  await expect(collection.getByLabel("Borobudur Marathon: held")).toBeVisible();
  await expect(collection.getByLabel("Jakarta Marathon: not yet")).toBeVisible();

  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await expect(medal).not.toContainText("Locked");
  await medal.getByRole("button", { name: "Preview Finisher medal" }).click();
  const preview = page.getByRole("dialog", { name: "Finisher medal" });
  await preview.getByRole("button", { name: /^Wear/ }).click();
  await expect(preview).toContainText("You are wearing it");
});
