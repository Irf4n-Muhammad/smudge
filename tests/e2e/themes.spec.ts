import { test, expect, type Page } from "@playwright/test";
import { openMore, openPeople, pickFeed } from "./nav";

/** Minimal JPEG whose EXIF GPS block points at the given coordinates (big-endian TIFF). */
function jpegAt(lat: number, lon: number) {
  const tiff = Buffer.alloc(200);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x8825, 10);
  tiff.writeUInt16BE(4, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18);
  const gps = 26;
  tiff.writeUInt16BE(4, gps);
  const entry = (i: number, tag: number, type: number, count: number, value: Buffer | number) => {
    const at = gps + 2 + i * 12;
    tiff.writeUInt16BE(tag, at);
    tiff.writeUInt16BE(type, at + 2);
    tiff.writeUInt32BE(count, at + 4);
    if (typeof value === "number") tiff.writeUInt32BE(value, at + 8);
    else value.copy(tiff, at + 8);
  };
  const rational = (at: number, deg: number) => {
    const d = Math.floor(deg),
      m = Math.floor((deg - d) * 60),
      s = Math.round(((deg - d) * 60 - m) * 60 * 100);
    [d, 1, m, 1, s, 100].forEach((v, i) => tiff.writeUInt32BE(v, at + i * 4));
  };
  entry(0, 1, 2, 2, Buffer.from("N\0"));
  entry(1, 2, 5, 3, 100);
  entry(2, 3, 2, 2, Buffer.from("E\0"));
  entry(3, 4, 5, 3, 130);
  rational(100, lat);
  rational(130, lon);
  const app1 = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(app1.length + 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    length,
    app1,
    Buffer.from([0xff, 0xd9]),
  ]);
}
async function call(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(`/api${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    },
    { method, path, body },
  );
}

test("a proven trip opens the Paris theme, worn on the profile and around posts in the feed", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const handle = "trip" + Date.now().toString(36);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Trip Tester");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Email", { exact: true }).fill(`${handle}@mail.example`);
  await page.getByLabel("Password").fill("a long enough phrase");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page
    .getByRole("dialog", { name: /^Welcome/ })
    .getByRole("button", { name: "Skip for now" })
    .click();

  await openMore(page, "Themes");
  const paris = page.getByRole("article", { name: "Theme Paris" });
  await expect(paris).toContainText("Trip to France");
  await expect(paris).toContainText("Locked");
  await paris.getByRole("button", { name: "Preview Paris" }).click();
  await expect(page.getByRole("dialog", { name: "Paris" })).toContainText(
    "Prove it with a photo taken in France",
  );
  await page.keyboard.press("Escape");

  await openMore(page, "Who you are");
  await page.getByRole("button", { name: "Trip photo" }).click();
  await page.getByLabel("A photo you took there (JPEG with location)").setInputFiles({
    name: "eiffel.jpg",
    mimeType: "image/jpeg",
    buffer: jpegAt(48.86, 2.35),
  });
  const toast = page.locator(".toast");
  await expect(toast).toContainText("Been to France");
  await expect(toast).toContainText("New themes to wear in Themes: Paris, Bonjour postcard");

  await openMore(page, "Themes");
  // During a season the choice is for this season; otherwise it is the everyday look.
  await paris.getByRole("button", { name: "Preview Paris" }).click();
  await page.getByRole("dialog", { name: "Paris" }).getByRole("button", { name: /^Wear/ }).click();
  await expect(page.getByRole("dialog", { name: "Paris" })).toContainText("You are wearing it");
  await page.keyboard.press("Escape");
  await expect(paris).toContainText("Wearing it");

  const draft = (
    await call(page, "POST", "/drafts", {
      package: {
        manifest: {
          schemaVersion: 2,
          runtimeVersion: "web-v1",
          name: "Bonjour",
          entrypoint: "index.html",
          capabilities: [],
          assets: [],
        },
        files: { "index.html": "<main><h1>Bonjour</h1></main>" },
      },
      metadata: {
        title: "Bonjour from " + handle,
        format: "custom",
        caption: "",
        contributors: [],
      },
    })
  ).body;
  await call(page, "POST", `/drafts/${draft.id}/publish`, { revision: 1 });
  await page.goto("/");
  const card = page.getByRole("article", { name: `Bonjour from ${handle} by Trip Tester` });
  await expect(card).toHaveClass(/themed/);
  await expect(card.locator(".decor-piece")).toHaveCount(2);
  await expect(card.locator(".decor-credit")).toContainText("Theme Paris · Trip to France");
  await expect(card.locator(".author strong").first()).toHaveCSS("font-family", /Instrument Serif/);

  await card.locator(".author").click();
  await expect(page.locator(".profile-theme-chip")).toContainText("Paris");
  await expect(page.locator(".profile-theme-chip")).toContainText("Trip to France");
  await expect(page.locator(".profile-theme-frame .decor-piece")).toHaveCount(2);
});
