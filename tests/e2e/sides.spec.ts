import { test, expect } from "@playwright/test";

test("switching sides changes the feed and where a new post goes; a private side stays unseen", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const bar = page.getByRole("navigation", { name: "Your sides" });
  await expect(bar.getByRole("button", { name: "Everyday" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article", { name: /^Saturday, up top/ })).toHaveCount(1);
  await expect(page.getByRole("article", { name: /^Sunday long run/ })).toHaveCount(0);

  await bar.getByRole("button", { name: "Runners" }).click();
  await expect(bar.getByRole("button", { name: "Runners" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article", { name: /^Sunday long run/ })).toHaveCount(1);
  await expect(page.getByRole("article", { name: /^Saturday, up top/ })).toHaveCount(0);
  await expect(page.locator(".composer strong")).toHaveText("How was the run?");
  await expect(page.locator(".post-card .side-tag").first()).toHaveText("Runners");

  // Leo's private festival side is not offered, and its post is not found by search.
  await bar.getByRole("button", { name: "Join or leave sides" }).click();
  const dialog = page.getByRole("dialog", { name: "Your sides" });
  await expect(dialog.getByText("Film Festival crew")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  await page.getByLabel("Search all posts").fill("jury notes");
  await expect(page.getByText("Looking around…")).toHaveCount(0);
  await expect(page.getByRole("article", { name: /^Jury notes/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).first().click();

  // A post made inside Runners carries the side, and is not in Everyday until shared.
  await page
    .getByRole("button", { name: "Create a post" })
    .filter({ visible: true })
    .first()
    .click();
  const pick = page.getByRole("dialog", { name: "Pick a post style" });
  await pick.getByRole("button", { name: "Use this style" }).click();
  const editor = page.getByRole("dialog", { name: "Edit your post" });
  await expect(editor.getByText("Posting to Runners")).toBeVisible();
  await editor.getByRole("button", { name: "Publish" }).click();
  const mine = page.getByRole("article", { name: /^The city glows after rain/ }).first();
  await expect(mine).toHaveCount(1);
  await expect(mine.locator(".side-tag")).toHaveText("Runners");

  await bar.getByRole("button", { name: "Everyday" }).click();
  await expect(page.getByRole("article", { name: /^Saturday, up top/ })).toHaveCount(1);
  await expect(page.getByRole("article", { name: /^The city glows after rain/ })).toHaveCount(0);

  await bar.getByRole("button", { name: "Runners" }).click();
  await mine.scrollIntoViewIfNeeded();
  await mine.getByRole("button", { name: /^Options for/ }).click();
  await page.getByRole("button", { name: "Also show in Everyday" }).click();
  await expect(page.locator(".toast")).toContainText("Now also in Everyday");
  await bar.getByRole("button", { name: "Everyday" }).click();
  const shared = page.getByRole("article", { name: /^The city glows after rain/ }).first();
  await expect(shared).toHaveCount(1);
  await expect(shared.locator(".side-tag")).toHaveClass(/shared/);
});
