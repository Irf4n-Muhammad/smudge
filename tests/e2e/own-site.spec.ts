import { test, expect, type Page } from "@playwright/test";

async function api(page: Page, path: string, body?: unknown, method?: string) {
  return page.evaluate(
    async ({ path, body, method }) => {
      const r = await fetch("/api" + path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error(path + ": " + r.status);
      return r.json();
    },
    { path, body, method },
  );
}

test("your own website becomes your profile once you prove it's yours, under Smudge's bar", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/?profile=you");
  await page.locator(".profile-controls").waitFor();
  await api(page, "/session", { userId: "you" });
  try {
    await page.goto("/?profile=you");
    await page.getByRole("button", { name: "Edit profile" }).first().click();
    await page
      .getByRole("button", { name: /Use my website/ })
      .filter({ visible: true })
      .first()
      .click();

    const setup = page.getByRole("dialog", { name: "Use my website" });
    await setup.getByLabel("Your website").fill("http://127.0.0.1:3010/");
    await setup.getByRole("button", { name: "Next" }).click();
    await expect(setup.getByRole("heading", { name: "Prove 127.0.0.1 is yours" })).toBeVisible();

    // Checking before the code is there says so plainly.
    await setup.getByRole("button", { name: "Check now" }).click();
    await expect(setup.getByText(/We couldn't find your code yet/)).toBeVisible();

    // The owner uploads the file, the way the dialog says.
    const code = (await setup.getByLabel("Your code").textContent())!;
    expect(code).toMatch(/^smudge-verify=/);
    await page.request.put("http://127.0.0.1:3010/__proof", { data: code });
    await setup.getByRole("button", { name: "Check now" }).click();
    await expect(setup.getByText(/is verified\. Your profile shows it now/)).toBeVisible();
    await setup.getByRole("button", { name: "Close dialog" }).click();

    // The profile is the site, with Smudge's bar on top.
    const profile = page.getByRole("region", { name: /'s website$/ });
    await expect(profile).toBeVisible();
    await expect(profile.locator(".own-site-verified")).toHaveText("Verified website 127.0.0.1");
    const site = profile.locator("iframe.own-site-frame").contentFrame();
    await expect(site.getByText("Kopi Senja").first()).toBeVisible();
    await profile.getByRole("button", { name: /^Posts/ }).click();
    await expect(page.getByRole("region", { name: "Posts page" })).toBeVisible();
    await page.getByRole("button", { name: "Page", exact: true }).click();
    await expect(profile).toBeVisible();

    // Someone else sees Follow and Message on the bar.
    await api(page, "/session", { userId: "maya" });
    await page.goto("/?profile=you");
    const visit = page.getByRole("region", { name: /'s website$/ });
    await expect(
      visit.getByRole("button", { name: /^(Follow|Following|Requested)$/ }),
    ).toBeVisible();
    await visit.getByRole("button", { name: "Message" }).click();
    await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();

    // A site that refuses frames falls back to the Smudge profile, and tells its owner why.
    await api(page, "/session", { userId: "you" });
    await api(page, "/me/site", { url: "http://127.0.0.1:3010/private" });
    await page.goto("/?profile=you");
    await expect(page.locator(".profile-controls")).toBeVisible();
    await expect(page.getByRole("region", { name: /'s website$/ })).toHaveCount(0);
    await expect(page.getByText(/asks not to be shown inside other sites/)).toBeVisible();
  } finally {
    await api(page, "/session", { userId: "you" });
    await api(page, "/me/site", undefined, "DELETE");
    await page.request.put("http://127.0.0.1:3010/__proof", { data: "" });
  }
});
