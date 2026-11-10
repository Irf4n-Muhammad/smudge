import { test, expect } from "@playwright/test";
import { openPeople } from "./nav";

test("people are found by what they do, and a search that finds nobody becomes a question", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await openPeople(page);
  const search = page.getByLabel("Search people");
  // Leo's proven chapter finds him, and says why.
  await search.fill("graduate lembayung");
  const leo = page.locator(".person-list").first().locator("li", { hasText: "Leo Park" });
  await expect(leo).toContainText("Graduate, Lembayung University");
  // Nobody is a wedding photographer in Bandung yet: ask the people you know instead.
  await search.fill("wedding photographer in bandung");
  await expect(
    page.getByText("Nobody matches “wedding photographer in bandung” yet."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Ask your people/ }).click();
  const editor = page.getByRole("dialog", { name: "Edit your post" });
  await expect(editor.getByRole("button", { name: "Publish" })).toBeVisible();
  await expect(
    editor.frameLocator("iframe").getByText("Wedding photographer in bandung?"),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Cancel" }).click();
});
