import type { Page } from "@playwright/test";

/** Opens the More menu: the rail's More on wide screens, the profile's ☰ on a phone. */
export async function openMoreMenu(page: Page) {
  const menu = page.getByRole("group", { name: "More" });
  if (await menu.isVisible()) return menu;
  const rail = page.locator(".sidebar");
  if (await rail.isVisible()) await rail.getByRole("button", { name: "More", exact: true }).click();
  else {
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Profile", exact: true })
      .click();
    const own = page.getByLabel("More options", { exact: true });
    if (await own.count()) await own.click();
    else await page.getByLabel("Profile options", { exact: true }).click();
  }
  return menu;
}

/** Opens a More-menu destination (Saved, Themes, Who you are, Account settings, Moderation…). */
export async function openMore(page: Page, label: string) {
  const menu = await openMoreMenu(page);
  await menu.getByRole("button", { name: label, exact: true }).click();
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

/** The appearance toggle lives in More. */
export async function switchAppearance(
  page: Page,
  label: "Switch to night mode" | "Switch to day mode",
) {
  await openMore(page, label);
}

/** Switches the demo account from the rail's photo: by id, or by name with { label }. */
export async function previewAs(page: Page, who: string | { label: string }) {
  await page.locator(".sidebar").getByRole("button", { name: "Preview as demo account" }).click();
  const menu = page.getByRole("menu", { name: "Preview as" });
  if (typeof who === "string") await menu.locator(`[data-user="${who}"]`).click();
  else await menu.getByRole("menuitemradio", { name: who.label, exact: true }).click();
}
