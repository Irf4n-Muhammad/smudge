import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { SidesService } from "../packages/core/src/sides.js";
import { CommunityService } from "../packages/core/src/community.js";
import { ShareCardService } from "../packages/core/src/share-card.js";
import { renderMoment } from "../apps/server/moments.js";
import { renderShareCard } from "../apps/server/share-card.js";

const alice = { userId: "alice" },
  bob = { userId: "bob" };

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-gifts-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["alice", "bob"])
      store.put("user", id, {
        id,
        name: id[0]!.toUpperCase() + id.slice(1),
        handle: id,
        initials: id[0]!.toUpperCase(),
        color: "#dbe5d2",
        bio: "",
      });
  });
  const social = new SocialService(store);
  const community = new CommunityService(social, () => false);
  const identity = new IdentityService(social, renderMoment);
  const sides = new SidesService(social);
  return { store, social, community, identity, sides };
}
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

test("a market theme can be given with a note; earned themes and yourself cannot", async () => {
  const { identity, community } = await setup();
  rejects(
    () => identity.giftDecoration(alice, { toId: "alice", decorationId: "cat-peek", note: "" }),
    "GIFT_SELF",
  );
  rejects(
    () => identity.giftDecoration(alice, { toId: "bob", decorationId: "finisher-medal", note: "" }),
    "GIFT_NOT_MARKET",
  );
  rejects(
    () => identity.giftDecoration(alice, { toId: "bob", decorationId: "nope", note: "" }),
    "GIFT_NOT_MARKET",
  );
  rejects(
    () => identity.giftDecoration(alice, { toId: "nobody", decorationId: "cat-peek", note: "" }),
    "INVALID_USER",
  );
  assert.throws(() =>
    identity.giftDecoration(alice, {
      toId: "bob",
      decorationId: "cat-peek",
      note: "x".repeat(141),
    }),
  );
  identity.giftDecoration(alice, { toId: "bob", decorationId: "cat-peek", note: "Sub-5!" });
  const bobs = identity.decorations(bob);
  assert.equal(bobs.gifts.length, 1);
  assert.equal(bobs.gifts[0]!.from.handle, "alice");
  assert.equal(bobs.gifts[0]!.note, "Sub-5!");
  assert.equal(bobs.gifts[0]!.decoration.name, "Cat peek");
  assert.equal(identity.decorations(alice).gifts.length, 0);
  // The gift is a notification for its receiver, and a block refuses the gift.
  assert.equal(
    community.notifications(bob).some((n) => n.type === "gift"),
    true,
  );
  community.block(bob, "alice");
  assert.throws(() =>
    identity.giftDecoration(alice, { toId: "bob", decorationId: "vines", note: "" }),
  );
});

test("a share card is your own, for a side you are in, and draws as one self-contained picture", async () => {
  const { identity, sides, social } = await setup();
  const cards = new ShareCardService(social, identity, sides);
  rejects(() => cards.card(alice, { side: "runners" }), "NOT_FOUND");
  rejects(() => cards.card(alice, { side: "film-fest" }), "NOT_FOUND");
  sides.join(alice, "runners");
  const card = cards.card(alice, { side: "runners" });
  assert.equal(card.side.name, "Runners");
  assert.equal(card.path, "/u/alice?side=runners");
  assert.equal(cards.card(alice, {}).path, "/u/alice");
  const svg = renderShareCard(
    { ...card, user: { ...card.user, name: 'Al <b>"x"</b>' } },
    "https://smudge.test/",
  );
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1080" height="1350"/);
  assert.match(svg, /Runners on Smudge/);
  assert.match(svg, /smudge.test\/u\/alice\?side=runners/);
  assert.doesNotMatch(svg, /<b>/);
  assert.doesNotMatch(svg, /href="http/);
});
