import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { NowService } from "../packages/core/src/now.js";
import { PagesService } from "../packages/core/src/pages.js";
import { GUEST, SocialService } from "../packages/core/src/social.js";

const rina = { userId: "rina" },
  dika = { userId: "dika" };
const draft = (title: string) => ({
  package: {
    manifest: {
      schemaVersion: 1 as const,
      runtimeVersion: "web-v1" as const,
      name: title,
      entrypoint: "index.html",
      capabilities: [],
    },
    files: { "index.html": `<h1>${title}</h1>` },
  },
  metadata: { title, format: "custom", caption: "", contributors: [] },
});

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "forma-pages-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  store.transaction(() => {
    for (const id of ["rina", "dika"])
      store.put("user", id, {
        id,
        name: id[0]!.toUpperCase() + id.slice(1),
        handle: id,
        initials: id[0]!.toUpperCase(),
        color: "#eee",
        bio: "",
      });
  });
  const social = new SocialService(store);
  const now = new NowService(social, () => new Date());
  // The "posted" source, as the server installs it (ADR 0044).
  now.sources.push((ownerId) =>
    social
      .feed({ userId: ownerId })
      .filter((p) => p.ownerId === ownerId)
      .map((p) => ({
        id: `post:${p.id}`,
        kind: "posted" as const,
        text: p.metadata.title,
        at: p.createdAt,
        source: "smudge" as const,
      })),
  );
  const pages = new PagesService(store, social, now);
  const publish = (who: { userId: string }, title: string) =>
    social.publish(who, social.createDraft(who, draft(title)).id, 1);
  return { store, social, now, pages, publish };
}

test("the Posts page lists a person's posts newest first, without moments, by the feed's rules", async () => {
  const { social, pages, publish } = await setup();
  const first = publish(rina, "Coast");
  const second = publish(rina, "Gig");
  const moment = publish(rina, "The party");
  publish(dika, "Dika's");
  pages.isMoment = (id) => id === moment.id;
  assert.deepEqual(
    pages.posts("dika", "rina").map((p) => p.title),
    ["Gig", "Coast"],
  );
  assert.equal(pages.posts("dika", "rina")[1]!.id, first.id);
  assert.equal(pages.posts(GUEST, "rina").length, 2);
  // Whatever hides a post from the feed hides it from the page.
  social.viewFilter = (viewerId, post) => viewerId !== GUEST || post.id !== second.id;
  assert.deepEqual(
    pages.posts(GUEST, "rina").map((p) => p.title),
    ["Coast"],
  );
});

test("Stories are the days read from posts, now entries and moments, newest first", async () => {
  const { now, pages, publish } = await setup();
  const post = publish(rina, "Gig");
  now.add(rina, { kind: "listening", text: "Velvet Static", by: "After Hours" });
  pages.cards = (viewerId, ownerId) =>
    viewerId === "dika" && ownerId === "rina"
      ? [
          {
            gatheringId: "g1",
            kind: "wedding",
            title: "Rooftop",
            date: "2020-01-01",
            place: "Home",
            cover: false,
            people: 4,
            host: false,
          },
        ]
      : [];
  const seen = pages.timeline("dika", "rina");
  assert.equal(seen.posts, 1);
  assert.deepEqual(
    seen.items.map((i) => i.kind),
    ["now", "post", "moment"],
  );
  // A post is a tile already; its "posted" entry is not repeated as a line.
  assert.ok(!seen.items.some((i) => i.kind === "now" && i.entry.kind === "posted"));
  const tile = seen.items[1]!;
  assert.equal(tile.kind === "post" ? tile.post.id : "", post.id);
  assert.equal(seen.items[2]!.at, "2020-01-01T12:00:00.000Z");
  // A guest sees no memory cards, and what hides the now archive hides those lines.
  assert.deepEqual(
    pages.timeline(GUEST, "rina").items.map((i) => i.kind),
    ["now", "post"],
  );
  now.viewFilter = () => false;
  assert.deepEqual(
    pages.timeline(GUEST, "rina").items.map((i) => i.kind),
    ["post"],
  );
});
