import { test, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { createECDH, randomBytes } from "node:crypto";

async function call(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(`/api${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { method, path, body },
  );
}
async function signIn(page: Page, userId: string) {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await call(page, "POST", "/session", { userId });
  await page.reload();
  await page.locator(".post-card").first().waitFor();
}
// The bare headless shell always reports notifications as denied; full Chromium headless does not.
test.use({ channel: "chromium" });

type FeedPost = { id: string; ownerId: string; metadata: { title: string } };
const feed = async (page: Page) => (await call(page, "GET", "/feed")).body as FeedPost[];

test("an answer goes to your story as a picture, with what your friends said", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"]);
  await signIn(page, "you");
  const ask = (await feed(page)).find((p) => p.metadata.title === "Sweet or savoury breakfast?")!;
  expect(ask).toBeTruthy();
  await page.goto(`/?post=${ask.id}`);
  const card = page.locator(".post-card").first();
  const frame = card.locator("iframe").contentFrame();
  // The post's script is ready once it has said who answered so far.
  await expect(frame.locator("[data-ask-who]")).not.toBeEmpty();
  await frame.getByRole("button", { name: "Savoury" }).click();
  // Friends may have answered already; wait for your own answer to land.
  await expect(frame.locator("[data-ask-who]")).toContainText(/^You/);
  const share = card.getByRole("button", { name: "Share to story" });
  await expect(share).toBeVisible();
  const download = page.waitForEvent("download");
  await share.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("smudge-answer.png");
  await file.saveAs("test-results/answer-story.png");
  await expect(card).toContainText("Picture saved and link copied");
  // Right after answering is when a notification makes sense.
  await expect(card.getByRole("region", { name: "Notifications on this device" })).toBeVisible();
});

test("push: a friend answering what you answered reaches your phone, encrypted, and shows", async ({
  page,
  context,
}) => {
  // A stand-in push service on this machine: it records what Smudge sends it.
  const received: { auth: string; encoding: string; size: number }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      received.push({
        auth: String(req.headers.authorization ?? ""),
        encoding: String(req.headers["content-encoding"] ?? ""),
        size: Buffer.concat(chunks).length,
      });
      res.writeHead(201).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  try {
    await signIn(page, "leo");
    const ask = (await feed(page)).find((p) => p.metadata.title === "What should I read next?")!;
    // Leo answers first, and turns on notifications for this device.
    await call(page, "POST", `/posts/${ask.id}/claim`, { answer: { pick: "Dune" } });
    const keys = {
      p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    };
    expect(
      (await call(page, "POST", "/push", { endpoint: `http://127.0.0.1:${port}/leo`, keys }))
        .status,
    ).toBe(200);
    expect((await call(page, "GET", "/push")).body.on).toBe(true);
    const refused = await call(page, "POST", "/push", {
      endpoint: "https://example.com/steal",
      keys,
    });
    expect(refused.status).toBe(400);

    // Leo follows Alex: when Alex answers too, Leo's phone hears it.
    await call(page, "POST", "/session", { userId: "you" });
    await call(page, "POST", `/posts/${ask.id}/claim`, { answer: { pick: "Klara and the Sun" } });
    await expect.poll(() => received.length).toBeGreaterThan(0);
    expect(received[0]!.encoding).toBe("aes128gcm");
    expect(received[0]!.auth).toMatch(/^vapid t=.+, k=.+/);

    // The service worker shows what arrives and opens the post when tapped.
    await call(page, "POST", "/session", { userId: "leo" });
    await context.grantPermissions(["notifications"]);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.register("/sw.js"));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.evaluate(() => {
      const w = window as unknown as { pushed: string[] };
      w.pushed = [];
      navigator.serviceWorker.addEventListener("message", (e) => w.pushed.push(e.data?.body));
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("ServiceWorker.enable");
    const registration = await new Promise<string>((done) =>
      cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
        const r = e.registrations.find((x) => x.scopeURL.endsWith("/"));
        if (r) done(r.registrationId);
      }),
    );
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: new URL(page.url()).origin,
      registrationId: registration,
      data: JSON.stringify({
        title: "Smudge",
        body: "Alex answered “What should I read next?” too.",
        url: `/?post=${ask.id}`,
      }),
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { pushed: string[] }).pushed))
      .toContain("Alex answered “What should I read next?” too.");
  } finally {
    await call(page, "POST", "/push/off", { endpoint: `http://127.0.0.1:${port}/leo` });
    server.close();
  }
});
