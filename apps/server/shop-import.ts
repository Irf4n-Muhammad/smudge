import type { Slot } from "../../packages/contracts/src/mall.js";
import { AppError } from "../../packages/core/src/social.js";
import { safeGet, type FetchOptions } from "./site-fetch.js";

/** What a shop's website says about one product: the fields the Mall keeps. */
export interface ReadProduct {
  key: string;
  name: string;
  image: string;
  price: number;
  url: string;
  slot: Slot;
}

/** Words in a product's type or name that say where on an outfit it goes; first match wins. */
const hints: [Slot, RegExp][] = [
  ["shoes", /\b(shoes?|sneakers?|runners?|boots?|loafers?|sandals?|trainers?|slides?|mules?)\b/],
  ["bag", /\b(bags?|backpacks?|totes?|duffels?|duffles?|packs?|pouch(es)?|wallets?)\b/],
  ["outer", /\b(jackets?|coats?|parkas?|blazers?|sportcoats?|vests?|shells?|outerwear|anoraks?)\b/],
  ["bottom", /\b(pants?|jeans?|chinos?|shorts?|trousers?|skirts?|leggings?|bottoms?|denim)\b/],
];
export function guessSlot(text: string): Slot {
  const words = text.toLowerCase();
  return hints.find(([, pattern]) => pattern.test(words))?.[0] ?? "top";
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Reads the standard product feed many shop platforms publish at /products.json, from the
 * website its owner proved is theirs. Only https pictures are kept, and only what the Mall shows.
 */
export function parseProducts(origin: string, body: string): ReadProduct[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new AppError("SHOP_FEED_NOT_FOUND", 422);
  }
  const list = (data as { products?: unknown })?.products;
  if (!Array.isArray(list)) throw new AppError("SHOP_FEED_NOT_FOUND", 422);
  const seen = new Set<string>();
  return list.slice(0, 250).flatMap((raw: Record<string, unknown>) => {
    const key = text(raw?.handle, 120);
    const name = text(raw?.title, 80);
    const images = Array.isArray(raw?.images) ? (raw.images as { src?: unknown }[]) : [];
    const image = text(images[0]?.src, 500);
    const variants = Array.isArray(raw?.variants) ? (raw.variants as { price?: unknown }[]) : [];
    const price = Math.round(Number(variants[0]?.price) * 100);
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(key) || seen.has(key) || name.length < 2) return [];
    if (!image.startsWith("https://") || !Number.isFinite(price) || price < 0 || price > 10_000_000)
      return [];
    seen.add(key);
    return [
      {
        key,
        name,
        image,
        price,
        url: `${origin}/products/${key}`,
        slot: guessSlot(`${text(raw.product_type, 80)} ${name}`),
      },
    ];
  });
}

export async function readShop(siteUrl: string, options: FetchOptions = {}) {
  const origin = new URL(siteUrl).origin;
  const file = await safeGet(
    `${origin}/products.json?limit=250`,
    3_000_000,
    (type) => type.includes("json"),
    options,
  ).catch((e: unknown) => {
    if (e instanceof AppError && e.code.startsWith("SITE_"))
      throw new AppError("SHOP_FEED_NOT_FOUND", 422);
    throw e;
  });
  return parseProducts(origin, file.body.toString("utf8"));
}
