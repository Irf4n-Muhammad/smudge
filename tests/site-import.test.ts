import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { extractSite, buildImportedPage } from "../packages/core/src/site-import.js";
import { experienceSchema, metadataSchema } from "../packages/contracts/src/experience.js";
import { isPublicAddress, safeGet } from "../apps/server/site-fetch.js";
import { importSite } from "../apps/server/site-import.js";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";

const fixture = (name: string) => readFileSync(resolve("tests/fixtures/sites", name), "utf8");

test("a shop page becomes products, text and photos, with nothing executable kept", () => {
  const site = extractSite(fixture("bakery.html"), "https://kopisenja.example/");
  assert.equal(site.kind, "shop");
  assert.equal(site.siteName, "Kopi Senja");
  assert.equal(site.accent, "#b5532d");
  assert.deepEqual(
    site.products.map((p) => [p.name, p.price]),
    [
      ["Sourdough loaf", "Rp 45.000"],
      ["Butter croissant", "Rp 22.000"],
      ["Pandan chiffon", "Rp 38.000"],
      ["Iced palm sugar latte", "Rp 28.000"],
    ],
  );
  assert.equal(
    site.images[site.products[0]!.image!]!.src,
    "https://kopisenja.example/img/bread.jpg",
  );
  assert.equal(site.products[3]!.image, null);
  const text = JSON.stringify(site);
  assert.ok(!text.includes("tracker"), "scripts are dropped");
  assert.ok(!text.includes("Cart"), "navigation is dropped");
  assert.ok(text.includes("shape every loaf by hand"));
  // Escaped markup in the original stays text.
  assert.ok(site.blocks.some((b) => b.text.includes('<script>alert("escaped")</script>')));
});

test("an article keeps its headings and quote, and is rebuilt as a safe, valid post", () => {
  const site = extractSite(fixture("journal.html"), "https://walks.example/camino");
  assert.equal(site.kind, "article");
  assert.equal(site.images[0]!.src, "https://cdn.example.org/hero.jpg");
  assert.ok(site.blocks.some((b) => b.type === "quote"));
  assert.ok(site.blocks.some((b) => b.type === "h" && b.text.startsWith("What I packed")));
  const cover = "11111111-1111-4111-8111-111111111111";
  const built = buildImportedPage({
    kind: "article",
    title: site.title,
    siteName: site.siteName,
    intro: site.description,
    accent: null,
    blocks: [...site.blocks, { type: "p", text: '<img src=x onerror="alert(1)"> & "quotes"' }],
    images: [{ assetId: cover, alt: 'Hills "at" dawn' }],
    cover,
    products: [],
    source: { url: "https://walks.example/camino", host: "walks.example" },
  });
  experienceSchema.parse(built.package);
  metadataSchema.parse(built.metadata);
  const html = Object.values(built.package.files).join("\n");
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(
    html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;quotes&quot;"),
  );
  assert.ok(html.includes(`src="asset:${cover}"`));
  assert.deepEqual((built.package.manifest as { assets: string[] }).assets, [cover]);
  assert.equal(built.metadata.source?.host, "walks.example");
  assert.deepEqual(built.metadata.link, { label: "Open page" });
  assert.throws(() => buildImportedPage({ kind: "article" }));
});

test("the fetcher refuses private addresses, other ports, plain http and credentials", async () => {
  for (const a of [
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "0.0.0.0",
  ])
    assert.equal(isPublicAddress(a), false, a);
  for (const a of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(a), true, a);
  const reject = (url: string, code: string) =>
    assert.rejects(
      safeGet(url, 1000, () => true),
      (e: { code?: string }) => e.code === code,
      url,
    );
  await reject("https://127.0.0.1/", "SITE_NOT_ALLOWED");
  await reject("https://[::1]/", "SITE_NOT_ALLOWED");
  await reject("https://169.254.169.254/latest/meta-data", "SITE_NOT_ALLOWED");
  await reject("https://example.com:8443/", "SITE_NOT_ALLOWED");
  await reject("http://example.com/", "SITE_NEEDS_HTTPS");
  await reject("https://user:pw@example.com/", "SITE_URL_INVALID");
  await reject("file:///etc/passwd", "SITE_NEEDS_HTTPS");
  await reject("not a url", "SITE_URL_INVALID");
});

test("importing a local trial site downloads its photos as the person's assets", async () => {
  const pages: Record<string, string> = { "/": fixture("bakery.html") };
  const server = createServer((req, res) => {
    if (req.url === "/away") return res.writeHead(302, { location: "http://127.0.0.1:9/" }).end();
    if (req.url === "/big") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("x".repeat(2_100_000));
    }
    const img = /^\/img\/(\w+)\.jpg$/.exec(req.url ?? "");
    if (img) {
      const file = { bread: "spray", croissant: "concert", cake: "rooftop", shop: "coast" }[
        img[1]!
      ];
      if (!file) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(readFileSync(resolve("assets/demo", `${file}.jpg`)));
    }
    const html = pages[req.url ?? ""];
    if (!html) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-import-")), "db.sqlite"));
    store.transaction(() =>
      store.put("user", "ana", {
        id: "ana",
        name: "Ana",
        handle: "ana",
        initials: "A",
        color: "#fff",
        bio: "",
      }),
    );
    const social = new SocialService(store);
    const ana = { userId: "ana" };
    // Without the trial allowance, this machine's own address is off limits.
    await assert.rejects(
      importSite(social, ana, { url: `http://${host}/`, permission: true }, {}),
      (e: { code?: string }) => e.code === "SITE_NEEDS_HTTPS",
    );
    await assert.rejects(
      importSite(
        social,
        ana,
        { url: `http://${host}/`, permission: false },
        { allowHosts: [host] },
      ),
    );
    const { page, found } = await importSite(
      social,
      ana,
      { url: `http://${host}/`, permission: true },
      { allowHosts: [host] },
    );
    assert.equal(page.kind, "shop");
    assert.equal(found.products, 4);
    assert.equal(page.images.length, 4);
    for (const img of page.images) assert.equal(social.asset(ana, img.assetId).mime, "image/webp");
    assert.ok(page.products[0]!.assetId);
    assert.equal(page.cover, page.images[0]!.assetId);
    const built = buildImportedPage(page);
    experienceSchema.parse(built.package);
    // A redirect into a non-allowed address is checked like the first hop.
    await assert.rejects(
      safeGet(`http://${host}/away`, 1000, () => true, { allowHosts: [host] }),
      (e: { code?: string }) => e.code === "SITE_NEEDS_HTTPS" || e.code === "SITE_NOT_ALLOWED",
    );
    await assert.rejects(
      safeGet(`http://${host}/big`, 2_000_000, () => true, { allowHosts: [host] }),
      (e: { code?: string }) => e.code === "SITE_TOO_LARGE",
    );
  } finally {
    server.close();
  }
});
