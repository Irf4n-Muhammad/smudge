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

const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
const plain = (v: unknown, max: number) =>
  text(v, max * 4)
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code: string) => {
      if (code[0] !== "#") return entities[code.toLowerCase()] ?? all;
      const n =
        code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return n > 31 && n < 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .trim()
    .slice(0, max);
const keyFrom = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
/** A link the shop gave for a product, kept only when it is on the shop's own website. */
function ownLink(origin: string, value: unknown, fallback: string) {
  const link = text(value, 500);
  if (!link) return fallback;
  try {
    const url = new URL(link, origin);
    if (url.origin === origin) return url.href;
  } catch {
    // Not a link: use the fallback.
  }
  return fallback;
}
function keep(out: ReadProduct[], seen: Set<string>, p: Omit<ReadProduct, "slot">, words: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(p.key) || seen.has(p.key) || p.name.length < 2) return;
  if (!p.image.startsWith("https://") || p.image.length > 500) return;
  if (!Number.isFinite(p.price) || p.price < 0 || p.price > 10_000_000) return;
  seen.add(p.key);
  out.push({ ...p, slot: guessSlot(`${words} ${p.name}`) });
}

/** The product list a WooCommerce shop publishes at /wp-json/wc/store/v1/products. */
export function parseWoo(origin: string, body: string): ReadProduct[] {
  let list: unknown;
  try {
    list = JSON.parse(body);
  } catch {
    throw new AppError("SHOP_FEED_NOT_FOUND", 422);
  }
  if (!Array.isArray(list)) throw new AppError("SHOP_FEED_NOT_FOUND", 422);
  const out: ReadProduct[] = [];
  const seen = new Set<string>();
  for (const raw of list.slice(0, 250) as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") continue;
    const key = text(raw.slug, 120);
    const prices = (raw.prices ?? {}) as { price?: unknown; currency_minor_unit?: unknown };
    const minor = Number(prices.currency_minor_unit ?? 2);
    const images = Array.isArray(raw.images) ? (raw.images as { src?: unknown }[]) : [];
    const kinds = Array.isArray(raw.categories) ? (raw.categories as { name?: unknown }[]) : [];
    keep(
      out,
      seen,
      {
        key,
        name: plain(raw.name, 80),
        image: text(images[0]?.src, 500),
        price: Math.round((Number(text(prices.price, 20) || NaN) / 10 ** minor) * 100),
        url: ownLink(origin, raw.permalink, `${origin}/product/${key}`),
      },
      kinds.map((k) => plain(k?.name, 40)).join(" "),
    );
  }
  return out;
}

/** Every product a page describes in its structured data (the JSON-LD shops write for search). */
export function parseLd(pageUrl: string, html: string): ReadProduct[] {
  const origin = new URL(pageUrl).origin;
  const out: ReadProduct[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) return node.slice(0, 300).forEach((n) => visit(n, depth + 1));
    const n = node as Record<string, unknown>;
    visit(n["@graph"], depth + 1);
    visit(n.itemListElement, depth + 1);
    visit(n.item, depth + 1);
    visit(n.mainEntity, depth + 1);
    if (![n["@type"]].flat().includes("Product")) return;
    const offer = ([n.offers].flat()[0] ?? {}) as Record<string, unknown>;
    const spec = ([offer.priceSpecification].flat()[0] ?? {}) as Record<string, unknown>;
    const picture = [n.image].flat()[0];
    const url = ownLink(origin, n.url ?? offer.url, pageUrl);
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    keep(
      out,
      seen,
      {
        key:
          keyFrom(decodeURIComponent(last).replace(/\.[a-z]+$/i, "")) || keyFrom(plain(n.name, 80)),
        name: plain(n.name, 80),
        image: text(
          typeof picture === "object" && picture ? (picture as { url?: unknown }).url : picture,
          500,
        ),
        price: Math.round(Number(offer.price ?? offer.lowPrice ?? spec.price ?? NaN) * 100),
        url,
      },
      plain(n.category, 80),
    );
  };
  for (const [, body] of html.matchAll(
    /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(body!), 0);
    } catch {
      // A broken block doesn't spoil the others.
    }
  }
  return out;
}

/** The addresses a sitemap lists. */
export function sitemapLinks(origin: string, xml: string): string[] {
  const out: string[] = [];
  for (const [, loc] of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)) {
    try {
      const url = new URL(loc!.replace(/&amp;/g, "&"));
      if (url.origin === origin) out.push(url.href);
    } catch {
      // Skip what isn't an address.
    }
    if (out.length >= 5000) break;
  }
  return out;
}

const missing = (e: unknown) => {
  if (e instanceof AppError && (e.code.startsWith("SITE_") || e.code === "SHOP_FEED_NOT_FOUND"))
    return null;
  throw e;
};
const isJson = (type: string) => type.includes("json");
const isPage = (type: string) => type.includes("html");
const isXml = (type: string) => type.includes("xml") || type.includes("text/plain");

/** Product pages named in the site's sitemap, then read one by one for their structured data. */
async function readPages(siteUrl: string, origin: string, options: FetchOptions) {
  const get = (url: string, accept: (type: string) => boolean, max = 2_000_000) =>
    safeGet(url, max, accept, { ...options, timeoutMs: 6000 })
      .then((f) => f.body.toString("utf8"))
      .catch(missing);
  const productLike = /\/(products?|produk|shop|store|toko|item|p|catalog|katalog)\//i;
  let links = sitemapLinks(origin, (await get(`${origin}/sitemap.xml`, isXml)) ?? "");
  const nested = links.filter((l) => /\.xml(\?|$)/i.test(l));
  if (nested.length) {
    const chosen = nested.filter((l) => /product|produk/i.test(l));
    links = (
      await Promise.all((chosen.length ? chosen : nested).slice(0, 3).map((l) => get(l, isXml)))
    ).flatMap((xml) => sitemapLinks(origin, xml ?? ""));
  }
  const pages = [...new Set([siteUrl, `${origin}/`, ...links.filter((l) => productLike.test(l))])];
  const out: ReadProduct[] = [];
  const seen = new Set<string>();
  const queue = pages.slice(0, 40);
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        const html = await get(url, isPage, 1_500_000);
        for (const p of html ? parseLd(url, html) : [])
          if (!seen.has(p.key)) {
            seen.add(p.key);
            out.push(p);
          }
      }
    }),
  );
  return out;
}

/**
 * Reads a shop's products from the website its owner proved is theirs: the list Shopify or
 * WooCommerce publishes, or else the structured data on the product pages its sitemap names.
 */
export async function readShop(siteUrl: string, options: FetchOptions = {}) {
  const origin = new URL(siteUrl).origin;
  const feed = async (path: string, parse: (origin: string, body: string) => ReadProduct[]) => {
    const file = await safeGet(origin + path, 3_000_000, isJson, options).catch(missing);
    try {
      return file ? parse(origin, file.body.toString("utf8")) : [];
    } catch (e) {
      return missing(e) ?? [];
    }
  };
  const shopify = await feed("/products.json?limit=250", parseProducts);
  if (shopify.length) return shopify;
  const woo = await feed("/wp-json/wc/store/v1/products?per_page=100", parseWoo);
  if (woo.length) return woo;
  const pages = await readPages(siteUrl, origin, options);
  if (!pages.length) throw new AppError("SHOP_FEED_NOT_FOUND", 422);
  return pages;
}
