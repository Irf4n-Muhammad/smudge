import type { SocialService } from "../../packages/core/src/social.js";

/**
 * Leo's fan room, the Long Run Club: $5 a month, proven fans are people holding a marathon
 * series stamp. Maya joined ten days ago and holds one. Its first drop, a club singlet, is open
 * now for fans and stamp holders and opens for everyone in two days; Maya already claimed one.
 */
export function seedFans(service: SocialService) {
  seedRoom(service);
  seedPictures(service);
}

/** Stand-in pictures from a running shop's public catalog, until creators upload their own. */
const pictures = "https://cdn.shopify.com/s/files/1/0075/4617/5546/files/";

/**
 * Pictures for the drops, and two more so the page shows every state: a tee that is open to
 * everyone now, and an earlier singlet that is gone.
 */
function seedPictures(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-fans-v2")) return;
  const first = store.get<Record<string, unknown>>("drop", "drop-leo-singlet");
  if (!first) return;
  const now = Date.now();
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  store.transaction(() => {
    store.put("drop", "drop-leo-singlet", {
      ...first,
      image: `${pictures}11114-11101_moth-tech-waffle-singlet_off-white_front.jpg`,
    });
    store.put("drop", "drop-leo-tee", {
      id: "drop-leo-tee",
      ownerId: "leo",
      title: "Recovery tee, plum",
      note: "For the day after. Soft, loose, forty made.",
      price: 2800,
      quantity: 40,
      opens: at(-72),
      everyone: at(-24),
      color: "#e9e4dc",
      image:
        "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-11-15_F-T-TIS-CR-SS-WINE_flat.jpg",
      createdAt: at(-96),
    });
    store.put("drop", "drop-leo-singlet-0", {
      id: "drop-leo-singlet-0",
      ownerId: "leo",
      title: "Club singlet, run 00",
      note: "The first two, for the first two who showed up.",
      price: 0,
      quantity: 2,
      opens: at(-24 * 40),
      everyone: at(-24 * 38),
      color: "#2b2b2b",
      image: `${pictures}11114-00A01_moth-tech-waffle-singlet_aged-black_front_774e46d0-1a06-4f53-ac20-30fb7419a770.jpg`,
      createdAt: at(-24 * 41),
    });
    const claims: [string, string, string, number][] = [
      ["drop-leo-tee", "maya", "DROP-5EED0002", -60],
      ["drop-leo-tee", "ines", "DROP-5EED0003", -20],
      ["drop-leo-singlet-0", "maya", "DROP-5EED0004", -24 * 40 + 1],
      ["drop-leo-singlet-0", "nadia", "DROP-5EED0005", -24 * 39],
    ];
    for (const [dropId, userId, code, hours] of claims)
      if (store.get("user", userId))
        store.put("drop-claim", `${dropId}:${userId}`, {
          dropId,
          userId,
          code,
          ref: "demo-seed",
          at: at(hours),
        });
    store.put("system", "seed-fans-v2", { complete: true });
  });
}

function seedRoom(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-fans-v1")) return;
  if (!store.get("user", "leo")) return;
  const now = Date.now();
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  store.transaction(() => {
    store.put("fan-room", "leo", {
      ownerId: "leo",
      title: "Long Run Club",
      perks: "Route plans before anyone, a Sunday voice note, and first go at every drop.",
      price: 500,
      stampOrgId: "marathon-series",
      createdAt: at(-24 * 30),
    });
    if (store.get("user", "maya")) {
      store.put("fan", "leo:maya", {
        ownerId: "leo",
        userId: "maya",
        since: at(-24 * 10),
        until: at(24 * 20),
        ref: "demo-seed",
      });
      store.put("fan-note", "fan-note-maya-1", {
        id: "fan-note-maya-1",
        ownerId: "leo",
        authorId: "maya",
        text: "Did the hill loop this morning. My calves are filing a complaint.",
        createdAt: at(-5),
      });
    }
    store.put("fan-note", "fan-note-leo-1", {
      id: "fan-note-leo-1",
      ownerId: "leo",
      authorId: "leo",
      text: "Sunday: 18K along the river, easy pace. Start 6:30 at the bridge. Singlets are out today.",
      createdAt: at(-3),
    });
    store.put("drop", "drop-leo-singlet", {
      id: "drop-leo-singlet",
      ownerId: "leo",
      title: "Club singlet, run 01",
      note: "Thirty made, numbered. Collect at Sunday's run or have it posted.",
      price: 3500,
      quantity: 30,
      opens: at(-2),
      everyone: at(48),
      color: "#e4572e",
      createdAt: at(-26),
    });
    if (store.get("user", "maya"))
      store.put("drop-claim", "drop-leo-singlet:maya", {
        dropId: "drop-leo-singlet",
        userId: "maya",
        code: "DROP-5EED0001",
        ref: "demo-seed",
        at: at(-1),
      });
    store.put("system", "seed-fans-v1", { complete: true });
  });
}
