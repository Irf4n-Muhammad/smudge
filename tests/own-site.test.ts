import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { OwnSiteService, normalizeSiteUrl, type SiteProbe } from "../packages/core/src/own-site.js";
import { readSiteText, siteStatus } from "../apps/server/site-fetch.js";

async function setup(probe: SiteProbe, now = () => new Date("2026-11-06T10:00:00Z")) {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-site-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["ana", "budi"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  const social = new SocialService(store);
  return new OwnSiteService(social, probe, { now });
}
const ana = { userId: "ana" };
const code = (e: unknown) => (e as { code?: string }).code;

test("a site only shows on the profile once the domain is proven, and never leaks its token", async () => {
  const files: Record<string, string> = {};
  const sites = await setup({
    readText: async (url) => files[url] ?? null,
    txt: async () => [],
  });
  const set = sites.set(ana, { url: "ana.example/portfolio?ref=x#top" });
  assert.equal(set.url, "https://ana.example/portfolio");
  assert.equal(set.verified, false);
  assert.match(set.token!, /^smudge-verify=[0-9a-f]{24}$/);
  assert.equal(set.file, "https://ana.example/.well-known/smudge-verification.txt");
  assert.equal(sites.public("ana"), null, "unverified sites stay private");

  await assert.rejects(sites.verify(ana), (e) => code(e) === "SITE_NOT_VERIFIED");
  files[set.file!] = `${set.token}\n`;
  const ok = await sites.verify(ana);
  assert.equal(ok.verified, true);
  assert.equal(ok.method, "file");
  const seen = sites.public("ana")!;
  assert.equal(seen.host, "ana.example");
  assert.equal("token" in seen, false);

  // Another page on the same host keeps the proof; another host starts over.
  assert.equal(sites.set(ana, { url: "https://ana.example/" }).verified, true);
  const moved = sites.set(ana, { url: "https://other.example/" });
  assert.equal(moved.verified, false);
  assert.notEqual(moved.token, set.token);
  assert.equal(sites.public("ana"), null);

  sites.remove(ana);
  assert.equal(sites.mine(ana), null);
});

test("a DNS TXT record proves the domain too", async () => {
  const records: Record<string, string[]> = {};
  const sites = await setup({
    readText: async () => {
      throw new Error("unreachable");
    },
    txt: async (name) => records[name] ?? [],
  });
  const set = sites.set(ana, { url: "https://ana.example" });
  records["_smudge.ana.example"] = [set.token!];
  assert.equal((await sites.verify(ana)).method, "dns");
});

test("links that aren't public https sites are refused", () => {
  assert.throws(
    () => normalizeSiteUrl("http://ana.example"),
    (e) => code(e) === "SITE_NEEDS_HTTPS",
  );
  assert.throws(
    () => normalizeSiteUrl("https://u:p@ana.example"),
    (e) => code(e) === "SITE_URL_INVALID",
  );
  assert.throws(
    () => normalizeSiteUrl("https://localhost"),
    (e) => code(e) === "SITE_URL_INVALID",
  );
  assert.throws(
    () => normalizeSiteUrl("https://ana.example:8443"),
    (e) => code(e) === "SITE_NOT_ALLOWED",
  );
});

test("a site that answers without the token loses the badge on the daily recheck; a down one keeps it", async () => {
  let clock = new Date("2026-11-06T10:00:00Z");
  let mode: "has" | "lost" | "down" = "has";
  let token = "";
  const sites = await setup(
    {
      readText: async () => {
        if (mode === "down") throw new Error("down");
        return mode === "has" ? token : "someone else's site";
      },
      txt: async () => [],
    },
    () => clock,
  );
  token = sites.set(ana, { url: "https://ana.example" }).token!;
  await sites.verify(ana);
  mode = "down";
  clock = new Date("2026-11-08T10:00:00Z");
  await sites.recheck("ana");
  assert.ok(sites.public("ana"), "a site that is down keeps its proof");
  mode = "lost";
  await sites.recheck("ana");
  assert.equal(sites.public("ana"), null, "a domain that changed hands stops showing");
});

test("the site check tells down, refused and frameable apart, and reads the proof file", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/refuses") return res.writeHead(200, { "x-frame-options": "DENY" }).end();
    if (req.url === "/.well-known/smudge-verification.txt")
      return res.writeHead(200, { "content-type": "text/plain" }).end("smudge-verify=abc\n");
    if (req.url === "/") return res.writeHead(200, { "content-type": "text/html" }).end("<p>hi");
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  const options = { allowHosts: [host] };
  try {
    const origin = "https://smudge.example";
    assert.equal(await siteStatus(`http://${host}/`, origin, options), "ok");
    assert.equal(await siteStatus(`http://${host}/refuses`, origin, options), "refused");
    assert.equal(await siteStatus(`http://${host}/gone`, origin, options), "down");
    assert.equal(
      await siteStatus(`http://127.0.0.1:9/`, origin, { allowHosts: ["127.0.0.1:9"] }),
      "down",
    );
    assert.equal(
      await readSiteText(`http://${host}/.well-known/smudge-verification.txt`, options),
      "smudge-verify=abc\n",
    );
    assert.equal(await readSiteText(`http://${host}/nope`, options), null);
    // Without the local allowance this machine is off limits, as for every outside fetch.
    assert.equal(await siteStatus(`http://${host}/`, origin), "down");
  } finally {
    server.close();
  }
});
