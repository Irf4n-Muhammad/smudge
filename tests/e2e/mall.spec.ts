import { test, expect } from "@playwright/test";
import { previewAs } from "./nav";

test("the Mall: scroll people's fits, make your own, and give a friend something they wished for", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Mall" })
    .click();
  const mall = page.getByRole("region", { name: "Mall" });
  // Maya's London fit leads this month; Alex follows Maya, so it comes first.
  const maya = mall.getByRole("article", { name: "Tempo run, then coffee by Maya Chen" });
  await expect(maya).toBeVisible();
  await expect(maya).toContainText("Leading in London this month");
  await expect(maya).toContainText("near you");
  await expect(mall.getByRole("article", { name: /Shimokita Saturday/ })).toContainText(
    "Top fit in Tokyo",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Try Maya's fit, swap the shoes and share it.
  await maya.getByRole("button", { name: "Try it, change it" }).click();
  await expect(mall.getByRole("tab", { name: "Make a fit" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const shoes = mall.getByRole("region", { name: "Shoes" });
  await shoes.getByRole("button", { name: /Walking mule/ }).click();
  await expect(mall.getByRole("img", { name: /Walking mule/ })).toBeVisible();
  await mall.getByLabel("Name your fit").fill("Office, then rain");
  await mall.getByRole("button", { name: "Share this fit" }).click();
  await expect(mall.getByRole("article", { name: /^Office, then rain by/ })).toBeVisible();

  // Maya wishes for the moss shell, and Leo already started a group gift for it.
  await mall.getByRole("tab", { name: "Wishlists" }).click();
  const wishes = mall.getByRole("region", { name: "Maya Chen's wishlist" });
  await expect(wishes).toContainText("Rain shell, moss");
  await expect(wishes).toContainText("$60 of $189 from Leo");
  await wishes.getByRole("button", { name: /Chip in/ }).click();
  await expect(wishes).toContainText("$80 of $189");
  // The clay runners: Alex gives them alone.
  await wishes.getByRole("button", { name: "Give" }).click();
  const dialog = page.getByRole("dialog", { name: /Cloud runner, clay/ });
  await dialog.getByLabel("A note").fill("For the next 21K");
  await dialog.getByRole("button", { name: "Give it" }).click();
  await expect(dialog).toHaveCount(0);

  // Maya sees the voucher, with its code, and not the pot still open for her.
  await page.setViewportSize({ width: 1280, height: 900 });
  await previewAs(page, "maya");
  await page.locator(".sidebar").getByRole("button", { name: "Mall" }).click();
  await mall.getByRole("tab", { name: "Wishlists" }).click();
  const vouchers = mall.getByRole("region", { name: "Your vouchers" });
  await expect(vouchers).toContainText("Cloud runner, clay");
  await expect(vouchers).toContainText("“For the next 21K”");
  await expect(vouchers.locator("code")).toHaveText(/^SMUDGE-[0-9A-F]{8}$/);
  await expect(vouchers).not.toContainText("Rain shell, moss");
});
