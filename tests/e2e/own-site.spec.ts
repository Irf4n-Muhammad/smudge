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
    // The way in sits under the vibes; someone already editing goes back to them first.
    const vibes = page.getByRole("button", { name: /Use this vibe/ });
    await expect(vibes.or(page.getByText("Editing your profile"))).toBeVisible();
    if (!(await vibes.isVisible()))
      await page.getByRole("button", { name: "Vibe", exact: true }).click();
    await page.getByRole("button", { name: /Use my website/ }).click();

    const setup = page.getByRole("dialog", { name: "Use my website" });
    await setup.getByLabel("Your website").fill("http://127.0.0.1:3010/portfolio");
    await setup.getByRole("button", { name: "Continue" }).click();
    await expect(setup.getByRole("heading", { name: "Show it's yours," })).toBeVisible();
    await expect(setup.getByRole("button", { name: /smudge-verification\.txt/ })).toBeVisible();
    await expect(setup.getByText("/.well-known/smudge-verification.txt")).toBeVisible();

    // Checking before the file is there says so plainly.
    await setup.getByRole("button", { name: "Check" }).click();
    await expect(setup.getByText(/We couldn't find the file yet/)).toBeVisible();

    // The owner puts the downloaded file on their site.
    const { site } = (await api(page, "/me/site")) as { site: { token: string } };
    await page.request.put("http://127.0.0.1:3010/__proof", { data: site.token });
    await setup.getByRole("button", { name: "Check" }).click();
    await expect(setup.getByRole("heading", { name: "It's live." })).toBeVisible();
    await setup.getByRole("button", { name: "See my profile" }).click();
    await expect(setup).toHaveCount(0);

    // The profile is the site, under one slim Smudge row.
    const profile = page.getByRole("region", { name: /'s website$/ });
    await expect(profile.locator(".own-site-verified")).toHaveText("Verified website 127.0.0.1");
    const frame = profile.locator("iframe.own-site-frame").contentFrame();
    await expect(frame.getByRole("heading", { name: "Little moments, kept." })).toBeVisible();
    // Posts and Stories are in the same strip as every profile, with the site as its first tab.
    const strip = page.getByRole("navigation", { name: "Pages" });
    await expect(strip.getByRole("button", { name: "Website" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await strip.getByRole("button", { name: /^Posts/ }).click();
    await expect(page.getByRole("region", { name: "Posts page" })).toBeVisible();
    await strip.getByRole("button", { name: "Website" }).click();
    await expect(profile).toBeVisible();

    // Someone else follows from the strip and messages from the bar.
    await api(page, "/session", { userId: "maya" });
    await page.goto("/?profile=you");
    const visit = page.getByRole("region", { name: /'s website$/ });
    await expect(visit).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Follow|Following|Requested)$/ }).last(),
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

test("a brand with a proven website brings its own pieces into the Mall", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await api(page, "/session", { userId: "you" });
  try {
    const { site } = (await api(page, "/me/site", { url: "http://127.0.0.1:3010/portfolio" })) as {
      site: { token: string };
    };
    await page.request.put("http://127.0.0.1:3010/__proof", { data: site.token });
    await api(page, "/me/site/verify", {});
    await api(page, "/me/site-kind", { kind: "brand" });
    await page.goto("/");
    await page.locator(".sidebar").getByRole("button", { name: "Mall" }).click();
    const mall = page.getByRole("region", { name: "Mall" });
    const corner = mall.getByRole("region", { name: "Your shop" });
    await expect(corner).toContainText("Bring your pieces into the Mall from 127.0.0.1");
    await corner.getByRole("button", { name: "Bring pieces" }).click();
    const bring = page.getByRole("dialog", { name: /^Bring pieces from/ });
    // Where each piece goes is guessed from the shop's own words.
    await expect(bring.getByLabel("Where Wide trousers goes")).toHaveValue("bottom");
    await expect(bring.getByLabel("Where Canvas tote goes")).toHaveValue("bag");
    await bring.getByLabel("Bring Wide trousers").check();
    await bring.getByLabel("Bring Canvas tote").check();
    await bring.getByRole("button", { name: "Bring 2 into the Mall" }).click();
    await expect(bring).toHaveCount(0);
    await expect(corner).toContainText("2 of your pieces are in the Mall");
    await expect(mall.getByRole("article", { name: /^Wide trousers from / })).toBeVisible();

    // The shop says how many can be picked up in a city, and takes a piece out.
    await corner.getByRole("button", { name: "Your pieces" }).click();
    const pieces = page.getByRole("dialog", { name: "Your pieces in the Mall" });
    await pieces.getByLabel("City for pick-up counts").selectOption("London");
    await pieces.getByLabel("Wide trousers in London").fill("4");
    await pieces.getByLabel("Wide trousers in London").blur();
    await pieces.getByRole("button", { name: "Take Canvas tote out of the Mall" }).click();
    await expect(pieces.getByText("Canvas tote")).toHaveCount(0);
    const shop = (await api(page, "/mall/shop")) as {
      items: { name: string; stock: Record<string, number> }[];
    };
    expect(shop.items.map((i) => [i.name, i.stock])).toEqual([["Wide trousers", { London: 4 }]]);
  } finally {
    await api(page, "/session", { userId: "you" });
    await api(page, "/me/site", undefined, "DELETE");
    await page.request.put("http://127.0.0.1:3010/__proof", { data: "" });
  }
  // Without the website, the pieces leave with it.
  expect(((await api(page, "/mall/shop")) as { allowed: boolean }).allowed).toBe(false);
});
