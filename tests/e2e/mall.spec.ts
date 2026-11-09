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
  // Shop opens first as a grid to look through, each piece with who wears it.
  const tee = mall.getByRole("article", { name: "Tissue crew tee, plum from Everlane" });
  await expect(tee).toContainText(/In 2 fits by/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Fits: Maya's London fit leads this month; Alex follows Maya.
  await mall.getByRole("tab", { name: "Fits" }).click();
  const maya = mall.getByRole("article", { name: "Tempo run, then coffee by Maya Chen" });
  await expect(maya).toContainText("Leading in London this month");
  await expect(mall.getByRole("article", { name: /Shimokita Saturday/ })).toContainText(
    "Top fit in Tokyo",
  );

  // Wear Maya's fit, swap the shoes while scrolling the shop, and save it from the corner.
  await maya.getByRole("button", { name: "Try it, change it" }).click();
  await expect(mall.getByRole("tab", { name: "Shop" })).toHaveAttribute("aria-selected", "true");
  await mall.getByRole("button", { name: "Shoes", exact: true }).click();
  await expect(mall.getByRole("article", { name: /from Everlane$/ })).toHaveCount(0);
  const runner = mall.getByRole("article", { name: "Wool Runner, natural grey from Allbirds" });
  await runner.scrollIntoViewIfNeeded();
  await runner.getByRole("button", { name: "Try on Wool Runner, natural grey" }).click();
  await expect(
    runner.getByRole("button", { name: "Take off Wool Runner, natural grey" }),
  ).toBeVisible();
  // Tapping a piece opens the reel at it: one piece per screen, worn, with Buy.
  await runner.getByRole("button", { name: "Open Wool Runner, natural grey" }).click();
  await expect(
    mall.getByRole("button", { name: "Buy Wool Runner, natural grey at Allbirds" }),
  ).toBeVisible();
  await mall.getByRole("button", { name: "All pieces" }).click();
  await page.getByRole("button", { name: "Open your fit, 4 pieces" }).click();
  const fit = page.getByRole("dialog", { name: "Your fit" });
  await expect(fit.getByRole("img", { name: /Wool Runner, natural grey/ })).toBeVisible();
  await fit.getByLabel("Name your fit").fill("Office, then rain");
  await fit.getByRole("button", { name: "Save this fit" }).click();
  await expect(mall.getByRole("article", { name: /^Office, then rain by/ })).toBeVisible();

  // Maya wishes for the field jacket, and Leo already started a group gift for it.
  await mall.getByRole("tab", { name: "Wishlists" }).click();
  const wishes = mall.getByRole("region", { name: "Maya Chen's wishlist" });
  await expect(wishes).toContainText("Field jacket, burnt olive");
  await expect(wishes).toContainText("$60 of $238 from Leo");
  await wishes.getByRole("button", { name: /Chip in/ }).click();
  await expect(wishes).toContainText("$80 of $238");
  // The red Striders: Alex gives them alone.
  await wishes.getByRole("button", { name: "Give" }).click();
  const dialog = page.getByRole("dialog", { name: /Strider, warm red/ });
  await dialog.getByLabel("A note").fill("For the next 21K");
  await dialog.getByRole("button", { name: "Give it" }).click();
  await expect(dialog).toHaveCount(0);

  // Maya sees the voucher, with its code, and not the pot still open for her.
  await page.setViewportSize({ width: 1280, height: 900 });
  await previewAs(page, "maya");
  await page.locator(".sidebar").getByRole("button", { name: "Mall" }).click();
  await mall.getByRole("tab", { name: "Wishlists" }).click();
  const vouchers = mall.getByRole("region", { name: "Your vouchers" });
  await expect(vouchers).toContainText("Strider, warm red");
  await expect(vouchers).toContainText("“For the next 21K”");
  await expect(vouchers.locator("code")).toHaveText(/^SMUDGE-[0-9A-F]{8}$/);
  await expect(vouchers).not.toContainText("Field jacket, burnt olive");
});
