import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { MallService } from "../packages/core/src/mall.js";
import type { MallItem } from "../packages/contracts/src/mall.js";

const now = new Date("2026-11-20T12:00:00Z");
const item = (id: string, slot: MallItem["slot"], price: number, stock = {}): MallItem => ({
  id,
  storeId: "shop",
  name: id,
  slot,
  image: `https://shop.example/${id}.jpg`,
  price,
  url: `https://shop.example/${id}`,
  stock,
});

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-mall-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["alex", "maya", "leo", "kai", "shop", "bot"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
    store.put("follow", "alex:maya", { userId: "alex", target: "maya" });
    for (const i of [
      item("shell", "outer", 18900, { London: 2 }),
      item("tee", "top", 2200, { Tokyo: 1 }),
      item("denim", "bottom", 3900, { London: 1 }),
      item("runner", "shoes", 12500),
    ])
      store.put("mall-item", i.id, i);
    // A brand-new account: its likes must not count toward awards.
    store.put("credential", "bot", { createdAt: "2026-11-19T00:00:00Z" });
  });
  const social = new SocialService(store);
  const mall = new MallService(social, () => now);
  const charges: { userId: string; amount: number }[] = [];
  mall.payments = {
    name: "test",
    charge: (c) => {
      charges.push(c);
      return { ref: `ref-${charges.length}` };
    },
  };
  return { store, social, mall, charges };
}

test("the catalog puts what you can pick up in your city first", async () => {
  const { mall } = await setup();
  mall.setCity({ userId: "alex" }, { city: "London" });
  const ids = mall.catalog({ userId: "alex" }).map((i) => [i.id, i.near]);
  assert.deepEqual(ids, [
    ["denim", 1],
    ["shell", 2],
    ["runner", 0],
    ["tee", 0],
  ]);
  assert.throws(() => mall.setCity({ userId: "alex" }, { city: "Atlantis" }));
});

test("fits need two real pieces in their slots; people you follow come first, then your city", async () => {
  const { mall } = await setup();
  mall.setCity({ userId: "alex" }, { city: "London" });
  mall.setCity({ userId: "leo" }, { city: "London" });
  assert.throws(() => mall.saveFit({ userId: "maya" }, { items: { outer: "shell" } }));
  assert.throws(
    () => mall.saveFit({ userId: "maya" }, { items: { outer: "tee", top: "shell" } }),
    /UNKNOWN_PIECE/,
  );
  const kai = mall.saveFit({ userId: "kai" }, { items: { top: "tee", shoes: "runner" } });
  const leo = mall.saveFit({ userId: "leo" }, { items: { top: "tee", bottom: "denim" } });
  const maya = mall.saveFit(
    { userId: "maya" },
    { title: "Rain", items: { outer: "shell", bottom: "denim" } },
  );
  assert.equal(maya.total, 18900 + 3900);
  assert.deepEqual(
    mall.fits({ userId: "alex" }).map((f) => f.id),
    [maya.id, leo.id, kai.id],
  );
});

test("each city's top fit comes from likes of accounts old enough, never the owner's", async () => {
  const { store, mall } = await setup();
  mall.setCity({ userId: "maya" }, { city: "London" });
  mall.setCity({ userId: "leo" }, { city: "London" });
  const maya = mall.saveFit({ userId: "maya" }, { items: { outer: "shell", bottom: "denim" } });
  const leo = mall.saveFit({ userId: "leo" }, { items: { top: "tee", bottom: "denim" } });
  for (const u of ["alex", "kai"]) mall.likeFit({ userId: u }, maya.id);
  // Leo's fit has more likes, but from himself and a day-old account.
  for (const u of ["leo", "bot", "alex"]) mall.likeFit({ userId: u }, leo.id);
  const fits = mall.fits({ userId: "alex" });
  assert.equal(fits.find((f) => f.id === maya.id)!.award, "Leading in London this month");
  assert.equal(fits.find((f) => f.id === leo.id)!.award, undefined);
  assert.equal(fits.find((f) => f.id === leo.id)!.likes, 3);
  // Last month's likes make last month's winner.
  for (const u of ["alex", "kai"])
    store.put("fit-like", `${leo.id}:${u}-old`, {
      fitId: leo.id,
      userId: u,
      at: "2026-10-12T10:00:00Z",
    });
  assert.equal(
    mall.fits({ userId: "alex" }).find((f) => f.id === leo.id)!.award,
    "Top fit in London, October 2026",
  );
  // Unliking toggles.
  assert.deepEqual(mall.likeFit({ userId: "alex" }, maya.id), { liked: false });
});

test("a wish becomes a voucher: alone at once, together once friends cover the price", async () => {
  const { store, mall, charges } = await setup();
  mall.wish({ userId: "maya" }, "shell");
  mall.wish({ userId: "maya" }, "runner");
  const list = mall.wishlist({ userId: "alex" }, "maya");
  assert.deepEqual(list.items.map((i) => i.id).sort(), ["runner", "shell"]);
  const page = mall.friendWishes({ userId: "alex" });
  assert.deepEqual(page.wishes.map((w) => `${w.person.id}:${w.item.id}`).sort(), [
    "maya:runner",
    "maya:shell",
  ]);
  assert.equal(mall.friendWishes({ userId: "alex" }, { q: "shell" }).total, 1);
  assert.equal(mall.friendWishes({ userId: "alex" }, { q: "nobody" }).total, 0);
  assert.equal(mall.friendWishes({ userId: "alex" }, { page: 9 }).page, 1);
  // Maya narrows her wishlist to friends: Alex follows her, she doesn't follow back.
  mall.setWishAudience({ userId: "maya" }, { audience: "friends" });
  assert.equal(mall.friendWishes({ userId: "alex" }).total, 0);
  assert.equal(mall.wishlist({ userId: "alex" }, "maya").items.length, 0);
  assert.throws(
    () => mall.give({ userId: "alex" }, { toId: "maya", itemId: "shell" }),
    /NOT_FOUND/,
  );
  assert.equal(mall.wishlist({ userId: "maya" }, "maya").audience, "friends");
  store.transaction(() => store.put("follow", "maya:alex", { userId: "maya", target: "alex" }));
  assert.equal(mall.friendWishes({ userId: "alex" }).total, 2);
  mall.setWishAudience({ userId: "maya" }, { audience: "me" });
  assert.equal(mall.friendWishes({ userId: "alex" }).total, 0);
  mall.setWishAudience({ userId: "maya" }, { audience: "everyone" });
  assert.throws(
    () => mall.give({ userId: "maya" }, { toId: "maya", itemId: "shell" }),
    /GIFT_TO_SELF/,
  );

  const solo = mall.give({ userId: "alex" }, { toId: "maya", itemId: "runner", note: "Run!" });
  assert.equal(solo.status, "given");
  assert.equal(solo.code, undefined, "only the recipient sees the code");

  const pot = mall.give(
    { userId: "alex" },
    { toId: "maya", itemId: "shell", group: true, amount: 8000 },
  );
  assert.equal(pot.status, "open");
  assert.equal(pot.raised, 8000);
  // The recipient doesn't see an open pot; friends do.
  assert.equal(mall.wishlist({ userId: "maya" }, "maya").pots.length, 0);
  assert.equal(mall.gifts({ userId: "maya" }).received.length, 1);
  assert.equal(mall.wishlist({ userId: "leo" }, "maya").pots[0]!.id, pot.id);
  assert.throws(() => mall.chipIn({ userId: "maya" }, pot.id, { amount: 1000 }), /NOT_FOUND/);
  const done = mall.chipIn({ userId: "leo" }, pot.id, { amount: 50000 });
  assert.equal(done.status, "given");
  assert.equal(done.raised, 18900, "nobody pays more than what is left");
  const received = mall.gifts({ userId: "maya" }).received;
  assert.equal(received.length, 2);
  const together = received.find((g) => g.id === pot.id)!;
  assert.match(together.code!, /^SMUDGE-[0-9A-F]{8}$/);
  assert.deepEqual(
    together.from.map((p) => p.id),
    ["alex", "leo"],
  );
  assert.throws(() => mall.chipIn({ userId: "kai" }, pot.id, { amount: 1000 }), /GIFT_COMPLETE/);
  // Every amount went through the payment partner, capped at what was left.
  assert.deepEqual(
    charges.map((c) => [c.userId, c.amount]),
    [
      ["alex", 12500],
      ["alex", 8000],
      ["leo", 10900],
    ],
  );
  // With no partner, giving is off rather than free.
  mall.payments = undefined;
  assert.throws(
    () => mall.give({ userId: "leo" }, { toId: "maya", itemId: "runner" }),
    /PAYMENTS_OFF/,
  );
  const notes = store
    .all<{ type: string; userId: string }>("notification")
    .filter((n) => n.type === "voucher");
  assert.equal(notes.length, 0, "no community layer here, so no notifications are stored");
});

test("erasing an account takes its city, fits, likes, wishes and gifts to it", async () => {
  const { store, mall } = await setup();
  mall.setCity({ userId: "maya" }, { city: "London" });
  const fit = mall.saveFit({ userId: "maya" }, { items: { outer: "shell", bottom: "denim" } });
  mall.likeFit({ userId: "alex" }, fit.id);
  mall.wish({ userId: "maya" }, "shell");
  mall.give({ userId: "alex" }, { toId: "maya", itemId: "shell", group: true, amount: 1000 });
  store.transaction(() => mall.erase("maya"));
  for (const kind of ["mall-city", "fit", "fit-like", "wish", "mall-gift"])
    assert.equal(store.all(kind).length, 0, kind);
});

test("a shop brings its own pieces in, sets pick-up counts, and takes them out", async () => {
  const { store, mall } = await setup();
  const product = {
    key: "linen-overshirt",
    name: "Linen overshirt",
    image: "https://shop.example/a.jpg",
    price: 12800,
    url: "https://shop.example/products/linen-overshirt",
    slot: "top" as const,
  };
  assert.throws(() => mall.addShopItems({ userId: "kai" }, [product]), /NOT_A_SHOP/);
  mall.isShop = (id) => id === "kai";
  const [piece] = mall.addShopItems({ userId: "kai" }, [product]);
  assert.equal(piece!.id, "kai:linen-overshirt");
  assert.equal(piece!.storeId, "kai");
  assert.ok(mall.catalog({ userId: "alex" }).some((i) => i.id === piece!.id));
  mall.setStock({ userId: "kai" }, piece!.id, { city: "London", count: 3 });
  // Bringing it again refreshes the price and keeps the counts.
  const [again] = mall.addShopItems({ userId: "kai" }, [{ ...product, price: 11000 }]);
  assert.equal(again!.price, 11000);
  assert.deepEqual(again!.stock, { London: 3 });
  assert.deepEqual(
    mall.setStock({ userId: "kai" }, piece!.id, { city: "London", count: 0 })[0]!.stock,
    {},
  );
  // Nobody else's pieces: not the catalog's, not another shop's.
  assert.throws(() => mall.removeShopItem({ userId: "kai" }, "shell"), /NOT_FOUND/);
  assert.throws(
    () => mall.setStock({ userId: "leo" }, piece!.id, { city: "London", count: 1 }),
    /NOT_FOUND/,
  );
  mall.wish({ userId: "maya" }, piece!.id);
  assert.deepEqual(mall.removeShopItem({ userId: "kai" }, piece!.id), []);
  assert.equal(store.all("wish").length, 0);
  mall.addShopItems({ userId: "kai" }, [product]);
  store.transaction(() => mall.erase("kai"));
  assert.equal(
    store.all<{ storeId: string }>("mall-item").filter((i) => i.storeId === "kai").length,
    0,
  );
});
