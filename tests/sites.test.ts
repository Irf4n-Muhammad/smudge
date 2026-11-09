import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { SitesService } from "../packages/core/src/sites.js";

const draftOf = (capabilities: string[], link?: { label: string; url: string }) => ({
  package: {
    manifest: {
      schemaVersion: 2 as const,
      runtimeVersion: "web-v1" as const,
      name: "Post",
      entrypoint: "index.html",
      capabilities,
      assets: [],
    },
    files: { "index.html": "<h1>Post</h1>" },
  },
  metadata: {
    title: "Post",
    format: "custom" as const,
    caption: "",
    contributors: [],
    ...(link ? { link } : {}),
  },
});

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-sites-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["alex", "maya", "leo", "cafe", "brand", "paper"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
    store.put("follow", "alex:maya", { userId: "alex", target: "maya" });
    store.put("follow", "alex:cafe", { userId: "alex", target: "cafe" });
  });
  const social = new SocialService(store);
  const verified = new Set(["cafe", "brand", "paper"]);
  const sites = new SitesService(social, (id) => verified.has(id));
  return { store, social, sites };
}

test("only a person with a proved website can say the account is a site", async () => {
  const { sites } = await setup();
  assert.throws(() => sites.declare({ userId: "alex" }, { kind: "brand" }), /SITE_NOT_VERIFIED/);
  assert.deepEqual(sites.declare({ userId: "cafe" }, { kind: "place" }), { kind: "place" });
  assert.equal(sites.kindOf("cafe"), "place");
  sites.declare({ userId: "cafe" }, { kind: null });
  assert.equal(sites.kindOf("cafe"), null);
});

test("a site's post must let you do something; a person's need not", async () => {
  const { social, sites } = await setup();
  sites.declare({ userId: "cafe" }, { kind: "place" });
  const plain = social.createDraft({ userId: "cafe" }, draftOf([]));
  assert.throws(() => social.publish({ userId: "cafe" }, plain.id, 1), /SITE_POST_NEEDS_ACTION/);
  const linked = social.createDraft(
    { userId: "cafe" },
    draftOf([], { label: "Reserve", url: "https://cafe.example/reserve" }),
  );
  assert.ok(social.publish({ userId: "cafe" }, linked.id, 1));
  const plan = social.createDraft({ userId: "cafe" }, draftOf(["plan.read", "plan.join"]));
  assert.ok(social.publish({ userId: "cafe" }, plan.id, 1));
  const mine = social.createDraft({ userId: "alex" }, draftOf([]));
  assert.ok(social.publish({ userId: "alex" }, mine.id, 1));
});

test("followed sites take at most one slot in five; others rise only when people bring them", async () => {
  const { store, sites } = await setup();
  store.transaction(() => {
    store.put("site-kind", "cafe", { kind: "place" });
    store.put("site-kind", "brand", { kind: "brand" });
    store.put("site-kind", "paper", { kind: "media" });
  });
  // Newest first: three cafe posts in a row, then people, a brand post and a paper post.
  const feed = [
    { id: "c1", ownerId: "cafe" },
    { id: "c2", ownerId: "cafe" },
    { id: "c3", ownerId: "cafe" },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, ownerId: "maya" })),
    { id: "b1", ownerId: "brand" },
    { id: "p1", ownerId: "paper" },
  ];
  store.transaction(() => {
    store.put("post", "b1", { id: "b1", ownerId: "brand" });
    store.put("post", "p1", { id: "p1", ownerId: "paper" });
    store.put("save", "b1:maya", { postId: "b1", userId: "maya" });
    store.put("save", "b1:leo", { postId: "b1", userId: "leo" });
    // The owner saving its own post doesn't count, and one person isn't enough.
    store.put("save", "p1:paper", { postId: "p1", userId: "paper" });
    store.put("save", "p1:maya", { postId: "p1", userId: "maya" });
  });
  const out = sites.mix("alex", feed);
  const ids = out.map((m) => m.post.id);
  assert.deepEqual(ids.slice(0, 11), [
    "c1",
    "m0",
    "m1",
    "m2",
    "m3",
    "c2",
    "m4",
    "m5",
    "m6",
    "b1",
    "m7",
  ]);
  // The rising slot counts as a site slot, so the next cafe post waits five more.
  assert.equal(ids.indexOf("c3"), 14);
  assert.equal(out[9]!.rising, true);
  assert.ok(!ids.includes("p1"));
  assert.equal(ids.length, feed.length - 1);
  // Never two site posts closer than five apart, rising aside.
  const siteSlots = out.flatMap((m, i) => (m.post.ownerId === "cafe" ? [i] : []));
  for (let i = 1; i < siteSlots.length; i++) assert.ok(siteSlots[i]! - siteSlots[i - 1]! >= 5);
});
