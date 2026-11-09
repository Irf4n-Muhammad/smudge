import type { SocialService } from "../../packages/core/src/social.js";

/**
 * Leo's fan room, the Long Run Club: $5 a month, proven fans are people holding a marathon
 * series stamp. Maya joined ten days ago and holds one. Its first drop, a club singlet, is open
 * now for fans and stamp holders and opens for everyone in two days; Maya already claimed one.
 */
export function seedFans(service: SocialService) {
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
