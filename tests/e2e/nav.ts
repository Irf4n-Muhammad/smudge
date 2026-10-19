import type { Page } from "@playwright/test";

/** Opens a More-menu destination (Saved, Themes, Who you are, Account settings, Moderation…). */
export async function openMore(page: Page, label: string) {
  const dialog = page.getByRole("group", { name: "More" });
  if (!(await dialog.isVisible())) {
    const rail = page.locator(".sidebar");
    if (await rail.isVisible())
      await rail.getByRole("button", { name: "More", exact: true }).click();
    else {
      // On a phone More lives behind the profile's ☰.
      await page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("button", { name: "Profile", exact: true })
        .click();
      const own = page.getByLabel("More options", { exact: true });
      if (await own.count()) await own.click();
      else await page.getByLabel("Profile options", { exact: true }).click();
    }
  }
  await page
    .getByRole("group", { name: "More" })
    .getByRole("button", { name: label, exact: true })
    .click();
}

/** Switches the feed between For you and Following, or enters a browse mode. */
export async function pickFeed(page: Page, label: string) {
  await page.getByRole("button", { name: /^(For you|Following)$/ }).click();
  await page
    .getByRole("menu")
    .getByRole(label === "For you" || label === "Following" ? "menuitemradio" : "menuitem", {
      name: label,
    })
    .click();
}

/** The People tab of Search. */
export async function openPeople(page: Page) {
  await page
    .getByRole("button", { name: "Search", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("button", { name: "People", exact: true }).click();
}

/** The appearance toggle lives in More. */
export async function switchAppearance(
  page: Page,
  label: "Switch to night mode" | "Switch to day mode",
) {
  await openMore(page, label);
}
