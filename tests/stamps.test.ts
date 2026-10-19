import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { SidesService } from "../packages/core/src/sides.js";
import { renderMoment } from "../apps/server/moments.js";
import { collections } from "../packages/contracts/src/identity.js";

const alice = { userId: "alice" },
  bob = { userId: "bob" },
  leo = { userId: "leo" };

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-stamps-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["alice", "bob", "leo"])
      store.put("user", id, { id, name: id[0]!.toUpperCase() + id.slice(1), handle: id });
  });
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment);
  const sides = new SidesService(social);
  identity.chapterListeners.push((c) => sides.joinByChapter(c));
  return { store, social, identity, sides };
}
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);
const stampCode = (identity: IdentityService, stamp: string, uses = 5) =>
  identity.createInvite(leo, {
    orgId: "marathon-series",
    kind: "stamp",
    label: `Finisher, ${stamp} 2026`,
    stamp: { collection: "marathon-id-2026", stamp },
    uses,
  }).code;
const lock = (identity: IdentityService, actor: { userId: string }, id: string) =>
  identity.decorations(actor).items.find((d) => d.id === id)!;

test("only the organiser of a collection issues its stamps, and only real ones", async () => {
  const { identity } = await setup();
  rejects(
    () =>
      identity.createInvite(leo, {
        orgId: "film-fest",
        kind: "stamp",
        label: "Finisher",
        stamp: { collection: "marathon-id-2026", stamp: "borobudur" },
      }),
    "STAMP_UNKNOWN",
  );
  rejects(
    () =>
      identity.createInvite(leo, {
        orgId: "marathon-series",
        kind: "stamp",
        label: "Finisher",
        stamp: { collection: "marathon-id-2026", stamp: "comrades" },
      }),
    "STAMP_UNKNOWN",
  );
  // The schema itself refuses a stamp invite without a stamp, and a stamp on another kind.
  assert.throws(() =>
    identity.createInvite(leo, { orgId: "marathon-series", kind: "stamp", label: "Finisher" }),
  );
  assert.match(stampCode(identity, "borobudur"), /^[A-Z0-9]{10}$/);
});

test("a stamp code adds the stamp once, opens the race theme, and joins the series' side", async () => {
  const { identity, sides } = await setup();
  const code = stampCode(identity, "borobudur");
  assert.equal(identity.me(alice).collections.length, 0);
  assert.equal(lock(identity, alice, "finisher-medal").unlocked, false);
  const chapter = identity.redeemInvite(alice, { code, audience: "public" });
  assert.equal(chapter.kind, "stamp");
  assert.equal(chapter.stamp, "borobudur");
  const [collection] = identity.me(alice).collections;
  assert.equal(collection!.held, 1);
  assert.equal(collection!.total, 5);
  assert.deepEqual(
    collection!.stamps.map((st) => st.held),
    [true, false, false, false, false],
  );
  assert.equal(lock(identity, alice, "finisher-medal").unlocked, true);
  assert.match(lock(identity, alice, "series-finisher").reason!, /you have 1/);
  // A second Borobudur code adds nothing; the race is already in the passport.
  rejects(
    () => identity.redeemInvite(alice, { code: stampCode(identity, "borobudur") }),
    "STAMP_ALREADY_HELD",
  );
  assert.ok(sides.me(alice).mine.some((s) => s.id === "runners"));
});

test("the full set opens the series theme; a collection is seen as its owner shows it", async () => {
  const { identity } = await setup();
  for (const st of collections[0]!.stamps)
    identity.redeemInvite(alice, { code: stampCode(identity, st.id), audience: "circle" });
  assert.equal(lock(identity, alice, "series-finisher").unlocked, true);
  assert.equal(identity.collectionsFor(alice, "alice")[0]!.held, 5);
  // Close-circle stamps are not shown to someone outside the circle.
  assert.equal(identity.collectionsFor(bob, "alice").length, 0);
  const chapters = identity.me(alice).chapters.filter((c) => c.kind === "stamp");
  identity.setChapterAudience(alice, chapters[0]!.id, { audience: "public" });
  const seen = identity.collectionsFor(bob, "alice")[0]!;
  assert.equal(seen.held, 1);
  assert.equal(seen.stamps.filter((st) => st.held).length, 1);
});
