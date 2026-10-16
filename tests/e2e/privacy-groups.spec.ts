import { test, expect, type Page } from "@playwright/test";

// Switching between people waits out each toast, so these run longer than most.
test.describe.configure({ timeout: 120_000 });

const toast = (page: Page, text: string) =>
  expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();

// Each test signs up its own member, so the seeded demo people are left as they were.
async function signUp(page: Page, prefix: string) {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const handle = prefix + Date.now().toString(36);
  const name = `${prefix[0]!.toUpperCase()}${prefix.slice(1)} ${handle}`;
  await page.getByRole("button", { name: "Create an account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Handle").fill(handle);
  await dialog.getByLabel("Email", { exact: true }).fill(`${handle}@mail.example`);
  await dialog.getByLabel("Password").fill("a long enough phrase");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  // New accounts land on the feed with a short welcome: a photo and a few people to follow.
  await page
    .getByRole("dialog", { name: /^Welcome/ })
    .getByRole("button", { name: "Skip for now" })
    .click();
  return { handle, name };
}
async function viewAs(page: Page, option: string | { label: string }) {
  // The previous switch's toast must be gone, or it would pass for this one's.
  await expect(page.getByRole("status").filter({ hasText: "Now viewing" })).toHaveCount(0, {
    timeout: 20000,
  });
  await page.getByLabel("Preview as demo account").selectOption(option);
  await toast(page, "Now viewing");
}
// Waits for the button the current viewer should see, since switching people reloads the panel.
async function findPerson(page: Page, handle: string, button: string) {
  await page.getByRole("button", { name: "Find people", exact: true }).click();
  const target = page.getByRole("button", { name: button, exact: true });
  await expect(async () => {
    await page.getByLabel("Search people").fill(handle);
    await expect(target.first()).toBeVisible({ timeout: 2000 });
  }).toPass();
  return target;
}

test("a private account turns follows into requests the owner accepts", async ({ page }) => {
  const { handle, name } = await signUp(page, "quiet");
  await page.getByRole("button", { name: "Account settings" }).click();
  const privateSwitch = page.getByRole("switch", { name: /Private account/ });
  await privateSwitch.click();
  await toast(page, "Your account is private");
  await expect(privateSwitch).toBeChecked();

  await viewAs(page, "you");
  const follow = (await findPerson(page, handle, `Follow ${name}`)).first();
  await expect(page.locator(".member").filter({ hasText: name }).first()).toContainText("Private");
  await follow.click();
  await expect(
    page.getByRole("button", { name: `Cancel request to follow ${name}` }).first(),
  ).toHaveText("Requested");

  await viewAs(page, { label: name });
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const requests = page.getByRole("region", { name: "Follow requests" });
  await expect(requests).toContainText("Alex Morgan");
  await requests.getByRole("button", { name: "Accept Alex Morgan" }).click();
  await expect(requests).toHaveCount(0);

  await viewAs(page, "you");
  await findPerson(page, handle, `Unfollow ${name}`);
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(
    page.locator(".notification").filter({ hasText: `${name} accepted your follow request.` }),
  ).toBeVisible();
  // Tidy up the demo account's follows.
  await (await findPerson(page, handle, `Unfollow ${name}`)).first().click();
  await expect(
    page.getByRole("button", { name: `Follow ${name}`, exact: true }).first(),
  ).toBeVisible();
});

test("a group chat: create, talk, see unread, manage members and leave", async ({ page }) => {
  const { handle, name } = await signUp(page, "host");
  // Two demo people follow the new member, so the member can add them to a group.
  for (const who of ["ines", "raka"]) {
    await viewAs(page, who);
    await (await findPerson(page, handle, `Follow ${name}`)).first().click();
    await expect(
      page.getByRole("button", { name: `Unfollow ${name}`, exact: true }).first(),
    ).toBeVisible();
  }

  await viewAs(page, { label: name });
  await page
    .getByRole("button", { name: /^Messages/ })
    .first()
    .click();
  await page.getByRole("button", { name: "New group" }).click();
  const dialog = page.getByRole("dialog", { name: "New group" });
  await dialog.getByLabel("Group name").fill("Sketch club");
  const create = dialog.getByRole("button", { name: "Create group" });
  await dialog.getByRole("checkbox", { name: /Inès Laurent/ }).check();
  await expect(create).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /Kai Moreno/ }).check();
  await create.click();
  const thread = page.getByLabel("Group Sketch club");
  await expect(thread).toBeVisible();
  await thread.getByLabel("Write a message").fill("Welcome, both of you!");
  await thread.getByRole("button", { name: "Send message" }).click();
  await expect(
    thread.locator(".bubble.mine").filter({ hasText: "Welcome, both of you!" }),
  ).toBeVisible();

  await viewAs(page, "ines");
  await page
    .getByRole("button", { name: /^Messages \(1 new\)/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Sketch club/ }).click();
  await expect(page.locator(".bubble").filter({ hasText: "Welcome, both of you!" })).toContainText(
    name,
  );
  await page.getByLabel("Write a message").fill("Hi!");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".bubble.mine").filter({ hasText: "Hi!" })).toBeVisible();
  // Only the owner removes others; anyone can leave.
  await page.getByRole("button", { name: "3 people" }).click();
  const members = page.getByRole("region", { name: "Group members" });
  await expect(members.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await members.getByRole("button", { name: "Leave group" }).click();
  await page
    .getByRole("dialog", { name: /^Leave/ })
    .getByRole("button", { name: "Leave group" })
    .click();
  await expect(page.getByRole("button", { name: /Sketch club/ })).toHaveCount(0);

  await viewAs(page, { label: name });
  await page
    .getByRole("button", { name: /^Messages/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Sketch club/ }).click();
  await page.getByRole("button", { name: "2 people" }).click();
  await page.getByRole("button", { name: "Remove Kai Moreno" }).click();
  await expect(page.getByRole("button", { name: "1 person" })).toBeVisible();
  const left = await page.evaluate(() =>
    fetch("/api/groups")
      .then((r) => r.json())
      .then((g: { members: unknown[] }[]) => g[0]!.members.length),
  );
  expect(left).toBe(1);
});
