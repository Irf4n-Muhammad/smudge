import { test, expect, type Page } from "@playwright/test";

async function api(page: Page, path: string, body?: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch("/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error("API failed: " + r.status);
      return r.json();
    },
    { path, body },
  );
}

test("signup, prove a campus email, publish a locked moment and receive one preset sticker", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const handle = "grad" + Date.now().toString(36);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Grad Tester");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Email", { exact: true }).fill(`${handle}@mail.example`);
  await page.getByLabel("Password").fill("a long enough phrase");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your chapters" })).toBeVisible();

  await page.getByRole("button", { name: "Share a moment" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Graduation, locked" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();

  await page.getByLabel("Your campus or work email").fill(`${handle}@student.lembayung.edu`);
  await page.getByRole("button", { name: "Send code" }).click();
  const inbox = page.getByLabel("Local demo inbox");
  await expect(inbox).toContainText(`${handle}@student.lembayung.edu`);
  const code = (await inbox.innerText()).match(/code is (\d{6})/)![1]!;
  await page.getByLabel("6-digit code").fill(code);
  await page.getByLabel("Student, graduate, lecturer…").fill("Graduate");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".chapter")).toContainText("Graduate, Lembayung University");

  await page.getByRole("button", { name: "Share a moment" }).first().click();
  await dialog.getByRole("button", { name: "Graduation", exact: true }).click();
  const title = "Done at last " + handle;
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByLabel("Who sees it").selectOption("public");
  await dialog.getByRole("button", { name: "Publish moment" }).click();
  const card = page.locator(".post-card", { hasText: title });
  await expect(card).toContainText("Graduation · Graduate, Lembayung University");
  await expect(card.getByRole("button", { name: "Use format" })).toHaveCount(0);

  // Another account reacts with a preset sticker; free text is not an option anywhere.
  await api(page, "/session", { userId: "maya" });
  await page.reload();
  const seen = page.locator(".post-card", { hasText: title });
  await seen.getByRole("button", { name: "React with So proud" }).click();
  await expect(seen.getByRole("button", { name: "Remove So proud" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await seen.getByRole("button", { name: `Open ${title}` }).click();
  const frame = page.frameLocator(".fullscreen-post iframe");
  await expect(frame.locator("#wall")).toContainText("Maya Chen");
  await expect(frame.locator("textarea, input[type=text]")).toHaveCount(0);
  await page.getByRole("button", { name: "Close page" }).click();
  await expect(page.locator(".fullscreen-post")).toHaveCount(0);
});
