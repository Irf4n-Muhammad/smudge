import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { FansService } from "../packages/core/src/fans.js";

let clock = new Date("2026-11-20T12:00:00Z");
const at = (hours: number) => new Date(clock.getTime() + hours * 3600000).toISOString();

async function setup(paid = true) {
  clock = new Date("2026-11-20T12:00:00Z");
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-fans-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["ines", "alex", "maya", "kai"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
    store.put("follow", "alex:maya", { userId: "alex", target: "maya" });
    // Kai holds a marathon stamp: a proven fan without paying.
    store.put("chapter", "k1", {
      id: "k1",
      ownerId: "kai",
      kind: "stamp",
      label: "Finisher",
      orgId: "marathon-series",
      stamp: "borobudur",
      method: "invite",
      audience: "public",
      createdAt: at(-100),
    });
  });
  const social = new SocialService(store);
  const fans = new FansService(social, () => clock);
  const charges: { userId: string; amount: number }[] = [];
  if (paid)
    fans.payments = {
      name: "test",
      charge: (c) => {
        charges.push(c);
        return { ref: `ref-${charges.length}` };
      },
    };
  fans.setRoom(
    { userId: "ines" },
    {
      title: "Pace Club",
      perks: "Plans first",
      price: paid ? 500 : 0,
      stampOrgId: "marathon-series",
    },
  );
  return { store, social, fans, charges };
}

test("a fan room: notes for paying fans only, a month at a time, friends shown", async () => {
  const { fans, charges } = await setup();
  const outside = fans.view({ userId: "alex" }, "ines");
  assert.equal(outside.member, false);
  assert.deepEqual(outside.notes, []);
  assert.throws(() => fans.post({ userId: "alex" }, "ines", { text: "hi" }), /FANS_ONLY/);
  fans.join({ userId: "maya" }, "ines");
  assert.deepEqual(charges, [
    { userId: "maya", amount: 500, currency: "USD", description: "Pace Club, one month" },
  ]);
  fans.post({ userId: "ines" }, "ines", { text: "Saturday long run, 7am" });
  clock = new Date(clock.getTime() + 60000);
  fans.post({ userId: "maya" }, "ines", { text: "In!" });
  const maya = fans.view({ userId: "maya" }, "ines");
  assert.deepEqual(
    maya.notes.map((n) => [n.text, n.byOwner]),
    [
      ["In!", false],
      ["Saturday long run, 7am", true],
    ],
  );
  assert.deepEqual(
    fans.view({ userId: "alex" }, "ines").friends.map((f) => f.id),
    ["maya"],
  );
  assert.equal(fans.view({ userId: "alex" }, "ines").fans, 1);
  // A month later, without paying again, Maya is out.
  clock = new Date(clock.getTime() + 31 * 86400000);
  assert.equal(fans.view({ userId: "maya" }, "ines").member, false);
  assert.throws(() => fans.join({ userId: "ines" }, "ines"), /OWN_ROOM/);
});

test("without a payment partner, paid rooms are off rather than free", async () => {
  const { fans } = await setup(false);
  assert.throws(
    () => fans.setRoom({ userId: "ines" }, { title: "Pace Club", price: 500 }),
    /PAYMENTS_OFF/,
  );
  assert.equal(fans.join({ userId: "maya" }, "ines").member, true);
});

test("a drop opens first for fans and stamp holders, then everyone, and sells out", async () => {
  const { fans, charges } = await setup();
  fans.join({ userId: "maya" }, "ines");
  const drop = fans.createDrop(
    { userId: "ines" },
    { title: "Singlet 01", price: 3500, quantity: 2, opens: at(1), everyone: at(48) },
  );
  assert.throws(
    () => fans.createDrop({ userId: "alex" }, { title: "x", price: 0, quantity: 1, opens: at(1) }),
    /NEEDS_FAN_ROOM/,
  );
  const forAlex = fans.drops({ userId: "alex" });
  assert.equal(forAlex.length, 0, "Alex neither follows Ines nor is a fan");
  assert.equal(fans.drops({ userId: "maya" })[0]!.wave, "fans");
  assert.throws(() => fans.claim({ userId: "maya" }, drop.id), /NOT_OPEN_YET/);
  clock = new Date(clock.getTime() + 2 * 3600000);
  const mine = fans.claim({ userId: "maya" }, drop.id);
  assert.match(mine.code!, /^DROP-[0-9A-F]{8}$/);
  assert.throws(() => fans.claim({ userId: "maya" }, drop.id), /ALREADY_CLAIMED/);
  // Kai holds a stamp: the presale is his too, without being in the room.
  assert.equal(fans.claim({ userId: "kai" }, drop.id).left, 0);
  // Alex waits for everyone, and by then it's gone.
  assert.throws(() => fans.claim({ userId: "alex" }, drop.id), /NOT_OPEN_YET/);
  clock = new Date(clock.getTime() + 48 * 3600000);
  assert.throws(() => fans.claim({ userId: "alex" }, drop.id), /SOLD_OUT/);
  assert.equal(charges.filter((c) => c.amount === 3500).length, 2);
  // Each claim has its number in the run; the maker sees who, and ticks them off.
  assert.equal(mine.number, 1);
  assert.equal(fans.drops({ userId: "ines" })[0]!.mine, true);
  assert.deepEqual(
    fans.claims({ userId: "ines" }, drop.id).map((c) => [c.person.id, c.number, c.collected]),
    [
      ["maya", 1, false],
      ["kai", 2, false],
    ],
  );
  assert.throws(() => fans.claims({ userId: "maya" }, drop.id), /NOT_FOUND/);
  const ticked = fans.collect({ userId: "ines" }, drop.id, { userId: "kai", collected: true });
  assert.deepEqual(
    ticked.map((c) => c.collected),
    [false, true],
  );
});

test("a drop carries its maker's own picture, and nobody else's", async () => {
  const { store, fans } = await setup();
  store.transaction(() => {
    store.put("asset", "11111111-1111-4111-8111-111111111111", {
      id: "11111111-1111-4111-8111-111111111111",
      ownerId: "ines",
      name: "a.png",
      mime: "image/png",
      base64: "AAAA",
    });
    store.put("follow", "maya:ines", { userId: "maya", target: "ines" });
  });
  const input = {
    title: "Cap",
    price: 0,
    quantity: 5,
    opens: at(0),
    assetId: "11111111-1111-4111-8111-111111111111",
  };
  const drop = fans.createDrop({ userId: "ines" }, input);
  assert.equal(drop.image, `/api/fans/drops/${drop.id}/image`);
  assert.equal(fans.dropImage({ userId: "maya" }, drop.id).mime, "image/png");
  fans.setRoom({ userId: "maya" }, { title: "Maya's", price: 0 });
  assert.throws(() => fans.createDrop({ userId: "maya" }, input), /NOT_FOUND/);
  assert.equal(fans.mine({ userId: "maya" }).room?.title, "Maya's");
  assert.equal(fans.mine({ userId: "alex" }).room, null);
});

test("erasing a creator takes the room, its fans, notes, drops and claims", async () => {
  const { store, fans } = await setup();
  fans.join({ userId: "maya" }, "ines");
  fans.post({ userId: "maya" }, "ines", { text: "hey" });
  const drop = fans.createDrop(
    { userId: "ines" },
    { title: "Free sticker", price: 0, quantity: 5, opens: at(-1) },
  );
  fans.claim({ userId: "maya" }, drop.id);
  store.transaction(() => fans.erase("ines"));
  for (const kind of ["fan-room", "fan", "fan-note", "drop", "drop-claim"])
    assert.equal(store.all(kind).length, 0, kind);
});
