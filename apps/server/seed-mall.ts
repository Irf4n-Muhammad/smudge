import type { User } from "../../packages/contracts/src/experience.js";
import type { City } from "../../packages/contracts/src/mall.js";
import { catalog } from "./mall-catalog.js";
import type { SocialService } from "../../packages/core/src/social.js";

/**
 * A demo Mall with real clothes: three shops' pieces (see mall-catalog.ts), with stock in a few
 * cities. Maya, Leo, Ines and Nadia put fits together; Maya's London fit leads this month and
 * Ines's won Tokyo last month. Maya wishes for a field jacket, and Leo already opened a group
 * gift for it.
 */
const shops: (User & { kind: "brand" })[] = [
  {
    id: "everlane",
    name: "Everlane",
    handle: "everlane.demo",
    initials: "E",
    color: "#ecebe6",
    bio: "Demo shop: pieces from Everlane's public catalog, to try the Mall. Not run by Everlane.",
    kind: "brand",
  },
  {
    id: "taylorstitch",
    name: "Taylor Stitch",
    handle: "taylorstitch.demo",
    initials: "TS",
    color: "#e4ddd0",
    bio: "Demo shop: pieces from Taylor Stitch's public catalog, to try the Mall. Not run by Taylor Stitch.",
    kind: "brand",
  },
  {
    id: "allbirds",
    name: "Allbirds",
    handle: "allbirds.demo",
    initials: "A",
    color: "#dfe6e0",
    bio: "Demo shop: shoes from Allbirds' public catalog, to try the Mall. Not run by Allbirds.",
    kind: "brand",
  },
];

export function seedMall(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-mall-v2")) return;
  const now = Date.now();
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const lastMonth = new Date(now);
  lastMonth.setUTCDate(10);
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  const inLastMonth = (h: number) => new Date(lastMonth.getTime() + h * 3_600_000).toISOString();
  // Likes this month must stay inside it, even on the 1st.
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const thisMonth = (hours: number) =>
    new Date(Math.max(monthStart.getTime() + 60_000, now - hours * 3_600_000)).toISOString();
  store.transaction(() => {
    for (const { kind, ...user } of shops)
      if (!store.get("user", user.id)) {
        store.put("user", user.id, user);
        store.put("site-kind", user.id, { kind });
      }
    // v1 drew pieces instead of showing real ones; they make way for the real catalog.
    for (const id of store.ids("mall-item")) store.remove("mall-item", id);
    for (const item of catalog) store.put("mall-item", item.id, item);
    const cities: [string, City][] = [
      ["you", "London"],
      ["maya", "London"],
      ["leo", "London"],
      ["ines", "Tokyo"],
      ["nadia", "Tokyo"],
    ];
    for (const [id, city] of cities)
      if (store.get("user", id)) store.put("mall-city", id, { city });
    const fits = [
      {
        id: "fit-maya-rain",
        ownerId: "maya",
        title: "Tempo run, then coffee",
        city: "London",
        items: {
          outer: "ev-teddy-bone",
          top: "ev-crew-plum",
          bottom: "ev-chino-black",
          shoes: "ab-cruiser-white",
        },
        createdAt: ago(20),
      },
      {
        id: "fit-leo-trail",
        ownerId: "leo",
        title: "Sunday trail",
        city: "London",
        items: {
          top: "ts-cutter-plaid",
          bottom: "ts-carnegie-olive",
          shoes: "ab-tree-runner-black",
          bag: "ev-backpack-navy",
        },
        createdAt: ago(9),
      },
      {
        id: "fit-ines-tokyo",
        ownerId: "ines",
        title: "Shimokita Saturday",
        city: "Tokyo",
        items: {
          outer: "ts-drover-suede",
          top: "ev-longsleeve-lilac",
          bottom: "ev-chino-cocoa",
          shoes: "ab-varsity-mushroom",
        },
        createdAt: inLastMonth(0),
      },
      {
        id: "fit-nadia-tokyo",
        ownerId: "nadia",
        title: "Rainy season",
        city: "Tokyo",
        items: {
          outer: "ev-liner-olive",
          top: "ev-crew-plum",
          bottom: "ev-chino-olive",
          bag: "ev-duffle-taupe",
        },
        createdAt: ago(30),
      },
    ];
    for (const f of fits) if (store.get("user", f.ownerId)) store.put("fit", f.id, f);
    const likes: [string, string, string][] = [
      ["fit-maya-rain", "leo", thisMonth(10)],
      ["fit-maya-rain", "ines", thisMonth(8)],
      ["fit-maya-rain", "nadia", thisMonth(6)],
      ["fit-leo-trail", "maya", thisMonth(5)],
      ["fit-ines-tokyo", "nadia", inLastMonth(5)],
      ["fit-ines-tokyo", "maya", inLastMonth(6)],
      ["fit-ines-tokyo", "leo", inLastMonth(7)],
    ];
    for (const [fitId, userId, at] of likes)
      if (store.get("fit", fitId) && store.get("user", userId))
        store.put("fit-like", `${fitId}:${userId}`, { fitId, userId, at });
    if (store.get("user", "maya")) {
      store.put("wish", "maya:ts-field-olive", {
        userId: "maya",
        itemId: "ts-field-olive",
        at: ago(30),
      });
      store.put("wish", "maya:ab-strider-red", {
        userId: "maya",
        itemId: "ab-strider-red",
        at: ago(50),
      });
      if (store.get("user", "leo"))
        store.put("mall-gift", "gift-pot-maya-jacket", {
          id: "gift-pot-maya-jacket",
          toId: "maya",
          itemId: "ts-field-olive",
          note: "For the 21K. From the Tuesday crew.",
          goal: 23800,
          chips: [{ userId: "leo", amount: 6000, at: ago(4) }],
          status: "open",
          createdAt: ago(4),
        });
    }
    if (store.get("user", "leo"))
      store.put("wish", "leo:ts-riley-navy", {
        userId: "leo",
        itemId: "ts-riley-navy",
        at: ago(12),
      });
    store.put("system", "seed-mall-v2", { complete: true });
  });
}
