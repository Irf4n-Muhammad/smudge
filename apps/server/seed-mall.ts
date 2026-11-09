import type { User } from "../../packages/contracts/src/experience.js";
import type { City, MallItem } from "../../packages/contracts/src/mall.js";
import type { SocialService } from "../../packages/core/src/social.js";

/**
 * A small demo Mall: Northline (the brand from the sites seed) and two more shops, a vintage
 * place and a sneaker brand, with stock in a few cities. Maya, Leo, Ines and Nadia put fits
 * together; Maya's London fit leads this month and Ines's won Tokyo last month. Maya wishes
 * for the moss rain shell, and Leo has already opened a group gift for it.
 */
const shops: (User & { kind: "brand" | "place" })[] = [
  {
    id: "rosevintage",
    name: "Rose Vintage",
    handle: "rose.vintage",
    initials: "RV",
    color: "#f3d6d6",
    bio: "Second-hand, sorted by colour. London and Tokyo.",
    kind: "place",
  },
  {
    id: "kumo",
    name: "Kumo Footwear",
    handle: "kumo",
    initials: "K",
    color: "#d9e4f2",
    bio: "Light shoes for long walks.",
    kind: "brand",
  },
];
const stock = (s: Partial<Record<City, number>>) => s;
export const demoItems: MallItem[] = [
  {
    id: "nl-shell-moss",
    storeId: "northline",
    name: "Rain shell, moss",
    slot: "outer",
    color: "#5d6b4a",
    price: 18900,
    url: "https://northline.example/shell-moss",
    stock: stock({ London: 3, Tokyo: 1, "New York": 4 }),
  },
  {
    id: "nl-shell-ink",
    storeId: "northline",
    name: "Rain shell, ink",
    slot: "outer",
    color: "#24324a",
    price: 18900,
    url: "https://northline.example/shell-ink",
    stock: stock({ London: 6, Seoul: 2 }),
  },
  {
    id: "nl-fleece",
    storeId: "northline",
    name: "Grid fleece",
    slot: "top",
    color: "#c9b38a",
    price: 9800,
    url: "https://northline.example/fleece",
    stock: stock({ London: 5, Tokyo: 3 }),
  },
  {
    id: "nl-trail-pant",
    storeId: "northline",
    name: "Trail pant",
    slot: "bottom",
    color: "#3d3a36",
    price: 11200,
    url: "https://northline.example/trail-pant",
    stock: stock({ London: 4, "New York": 2 }),
  },
  {
    id: "nl-sling",
    storeId: "northline",
    name: "Sling bag",
    slot: "bag",
    color: "#1f1f1f",
    price: 5400,
    url: "https://northline.example/sling",
    stock: stock({ London: 8, Tokyo: 2, Lagos: 3 }),
  },
  {
    id: "rv-cardigan",
    storeId: "rosevintage",
    name: "Mohair cardigan",
    slot: "outer",
    color: "#d9826b",
    price: 4600,
    url: "https://rose.example/cardigan",
    stock: stock({ London: 1, Tokyo: 1 }),
  },
  {
    id: "rv-stripe-tee",
    storeId: "rosevintage",
    name: "Breton tee",
    slot: "top",
    color: "#f4f1ea",
    pattern: "stripe",
    price: 2200,
    url: "https://rose.example/breton",
    stock: stock({ London: 2, Tokyo: 2 }),
  },
  {
    id: "rv-check-shirt",
    storeId: "rosevintage",
    name: "Flannel shirt",
    slot: "top",
    color: "#a8433a",
    pattern: "check",
    price: 2800,
    url: "https://rose.example/flannel",
    stock: stock({ Tokyo: 3 }),
  },
  {
    id: "rv-denim",
    storeId: "rosevintage",
    name: "Wide denim",
    slot: "bottom",
    color: "#5877a3",
    price: 3900,
    url: "https://rose.example/denim",
    stock: stock({ London: 2, Tokyo: 1 }),
  },
  {
    id: "rv-skirt",
    storeId: "rosevintage",
    name: "Pleated skirt",
    slot: "bottom",
    color: "#7a6a9c",
    price: 3400,
    url: "https://rose.example/skirt",
    stock: stock({ Tokyo: 2 }),
  },
  {
    id: "rv-tote",
    storeId: "rosevintage",
    name: "Canvas tote",
    slot: "bag",
    color: "#e5d3b3",
    price: 1800,
    url: "https://rose.example/tote",
    stock: stock({ London: 4, Tokyo: 4 }),
  },
  {
    id: "kumo-cloud-white",
    storeId: "kumo",
    name: "Cloud runner, white",
    slot: "shoes",
    color: "#f2f2f2",
    price: 12500,
    url: "https://kumo.example/cloud-white",
    stock: stock({ London: 5, Tokyo: 6, Seoul: 4, "New York": 3 }),
  },
  {
    id: "kumo-cloud-clay",
    storeId: "kumo",
    name: "Cloud runner, clay",
    slot: "shoes",
    color: "#c4734f",
    price: 12500,
    url: "https://kumo.example/cloud-clay",
    stock: stock({ Tokyo: 2, Seoul: 1 }),
  },
  {
    id: "kumo-mule",
    storeId: "kumo",
    name: "Walking mule",
    slot: "shoes",
    color: "#2b2b2b",
    price: 8900,
    url: "https://kumo.example/mule",
    stock: stock({ London: 2, Lagos: 2 }),
  },
];

export function seedMall(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-mall-v1")) return;
  // The stores must exist as accounts; Northline comes from the sites seed.
  if (!store.get("user", "northline")) return;
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
    for (const item of demoItems) store.put("mall-item", item.id, item);
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
          outer: "nl-shell-moss",
          top: "rv-stripe-tee",
          bottom: "rv-denim",
          shoes: "kumo-cloud-white",
        },
        createdAt: ago(20),
      },
      {
        id: "fit-leo-trail",
        ownerId: "leo",
        title: "Sunday trail",
        city: "London",
        items: { top: "nl-fleece", bottom: "nl-trail-pant", shoes: "kumo-mule", bag: "nl-sling" },
        createdAt: ago(9),
      },
      {
        id: "fit-ines-tokyo",
        ownerId: "ines",
        title: "Shimokita Saturday",
        city: "Tokyo",
        items: {
          outer: "rv-cardigan",
          top: "rv-check-shirt",
          bottom: "rv-skirt",
          shoes: "kumo-cloud-clay",
        },
        createdAt: inLastMonth(0),
      },
      {
        id: "fit-nadia-tokyo",
        ownerId: "nadia",
        title: "Rainy season",
        city: "Tokyo",
        items: { outer: "nl-shell-ink", top: "rv-stripe-tee", bottom: "rv-denim", bag: "rv-tote" },
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
      store.put("wish", "maya:nl-shell-moss", {
        userId: "maya",
        itemId: "nl-shell-moss",
        at: ago(30),
      });
      store.put("wish", "maya:kumo-cloud-clay", {
        userId: "maya",
        itemId: "kumo-cloud-clay",
        at: ago(50),
      });
      if (store.get("user", "leo"))
        store.put("mall-gift", "gift-pot-maya-shell", {
          id: "gift-pot-maya-shell",
          toId: "maya",
          itemId: "nl-shell-moss",
          note: "For the 21K. From the Tuesday crew.",
          goal: 18900,
          chips: [{ userId: "leo", amount: 6000, at: ago(4) }],
          status: "open",
          createdAt: ago(4),
        });
    }
    if (store.get("user", "leo"))
      store.put("wish", "leo:nl-shell-ink", { userId: "leo", itemId: "nl-shell-ink", at: ago(12) });
    store.put("system", "seed-mall-v1", { complete: true });
  });
}
