import { z } from "zod";
import type { Experience, Metadata } from "../../contracts/src/experience.js";

/**
 * Website import: a public page is read once on the server, reduced to plain text, photos and
 * prices, and rebuilt as an ordinary Smudge post. Nothing executable from the original survives:
 * the extractor keeps strings only, and the builder escapes every one of them.
 */

export const importKinds = ["article", "shop", "portfolio"] as const;
export type ImportKind = (typeof importKinds)[number];

/** What the extractor finds. Image `src` values are absolute URLs the server may download. */
export interface ExtractedSite {
  title: string;
  siteName: string;
  description: string;
  accent: string | null;
  kind: ImportKind;
  blocks: { type: "h" | "p" | "quote"; text: string }[];
  images: { src: string; alt: string }[];
  products: { name: string; price: string; image: number | null }[];
}

const blockTags = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
  "br",
]);
// Content inside these never becomes text: code, styling, vector art, forms and site chrome.
const skipTags = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "object",
  "canvas",
  "select",
  "textarea",
  "button",
  "nav",
  "head",
]);
const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  euro: "€",
  pound: "£",
  yen: "¥",
};
function decode(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : "";
    }
    return entities[code.toLowerCase()] ?? all;
  });
}
const clean = (text: string) =>
  decode(text)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();
function attrs(source: string) {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g,
  ))
    out[m[1]!.toLowerCase()] = decode((m[2] ?? "").replace(/^["']|["']$/g, ""));
  return out;
}
function absolute(src: string, base: URL) {
  try {
    const url = new URL(src.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
const pricePattern =
  /^(?:from\s+)?(?:[$€£¥₹]|rp\.?|idr|usd|eur|gbp|sgd|myr|aud)\s?\d[\d.,]*(?:\s?(?:k|rb|jt))?$|^\d[\d.,]*\s?(?:[$€£¥₹]|usd|eur|idr|rb|k)$/i;

/** Reads a fetched HTML document. Pure and synchronous, so it can be tested without a network. */
export function extractSite(html: string, pageUrl: string): ExtractedSite {
  const base = new URL(pageUrl);
  const meta: Record<string, string> = {};
  const blocks: ExtractedSite["blocks"] = [];
  const images: ExtractedSite["images"] = [];
  const imageIndex = new Map<string, number>();
  const jsonLd: string[] = [];
  let title = "";
  let text = "";
  let current: "h" | "p" | "quote" = "p";
  let skip: string[] = [];
  let inTitle = false;
  let inJsonLd = false;
  let rawScript = "";
  let lastImage: number | null = null;
  const pending: { text: string; type: "h" | "p" | "quote"; image: number | null }[] = [];

  const flush = () => {
    const t = clean(text);
    text = "";
    if (t) pending.push({ text: t.slice(0, 600), type: current, image: lastImage });
    current = "p";
  };
  const tagPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let at = 0;
  for (const m of html.slice(0, 2_000_000).matchAll(tagPattern)) {
    const between = html.slice(at, m.index);
    at = m.index! + m[0].length;
    if (inJsonLd) rawScript += between;
    else if (inTitle) title += between;
    else if (!skip.length) text += between;
    if (!m[2]) continue; // a comment
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "script" && !closing) {
      const a = attrs(m[3]!);
      if (a.type === "application/ld+json") {
        inJsonLd = true;
        rawScript = "";
        continue;
      }
    }
    if (tag === "script" && closing && inJsonLd) {
      inJsonLd = false;
      if (jsonLd.length < 10) jsonLd.push(rawScript);
      continue;
    }
    if (tag === "title") {
      inTitle = !closing;
      continue;
    }
    if (skipTags.has(tag)) {
      if (closing) {
        const i = skip.lastIndexOf(tag);
        if (i >= 0) skip = skip.slice(0, i);
      } else if (!voidTags.has(tag) && !/\/\s*$/.test(m[3]!)) skip.push(tag);
      continue;
    }
    if (tag === "meta" && !closing) {
      const a = attrs(m[3]!);
      const key = (a.property ?? a.name ?? "").toLowerCase();
      if (key && a.content && !meta[key]) meta[key] = a.content;
      continue;
    }
    if (skip.length) continue;
    if (tag === "img" && !closing) {
      const a = attrs(m[3]!);
      const raw = a.src || a["data-src"] || (a.srcset ?? "").split(",")[0]!.trim().split(" ")[0]!;
      const src = raw && !raw.startsWith("data:") ? absolute(raw, base) : null;
      const tiny = Number(a.width) > 0 && Number(a.width) < 80;
      if (src && !tiny && !/\b(icon|sprite|pixel|tracking|spacer)\b/i.test(src)) {
        if (!imageIndex.has(src) && images.length < 40) {
          imageIndex.set(src, images.length);
          images.push({ src, alt: clean(a.alt ?? "").slice(0, 200) });
        }
        lastImage = imageIndex.get(src) ?? null;
      }
      continue;
    }
    if (blockTags.has(tag)) {
      flush();
      if (!closing && /^h[1-6]$/.test(tag)) current = "h";
      if (!closing && tag === "blockquote") current = "quote";
    }
  }
  flush();

  // Products: structured data first, then "name, price" pairs as they appear on the page.
  const products: ExtractedSite["products"] = [];
  const addProduct = (name: string, price: string, image: number | null) => {
    if (products.length < 24 && name && price && !products.some((p) => p.name === name))
      products.push({ name: name.slice(0, 80), price: price.slice(0, 30), image });
  };
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const n = node as Record<string, unknown>;
    const type = ([] as unknown[]).concat(n["@type"] ?? []);
    if (type.includes("Product") && typeof n.name === "string") {
      const offer = ([] as unknown[]).concat(n.offers ?? [])[0] as
        | Record<string, unknown>
        | undefined;
      const amount = offer?.price ?? offer?.lowPrice;
      const currency = typeof offer?.priceCurrency === "string" ? offer.priceCurrency + " " : "";
      const img = ([] as unknown[]).concat(n.image ?? [])[0];
      const src = typeof img === "string" ? absolute(img, base) : null;
      let index: number | null = null;
      if (src) {
        if (!imageIndex.has(src) && images.length < 40) {
          imageIndex.set(src, images.length);
          images.push({ src, alt: clean(n.name).slice(0, 200) });
        }
        index = imageIndex.get(src) ?? null;
      }
      if (amount !== undefined) addProduct(clean(n.name), `${currency}${amount}`, index);
    }
    for (const value of Object.values(n)) if (typeof value === "object") visit(value);
  };
  for (const raw of jsonLd)
    try {
      visit(JSON.parse(raw));
    } catch {
      // Broken structured data is common; the page text still works.
    }
  // A card's photo is the last one seen before its name, unless the previous card already used it.
  let used: number | null = null;
  for (let i = 1; i < pending.length; i++) {
    const price = pending[i]!.text;
    const name = pending[i - 1]!.text;
    if (pricePattern.test(price) && name.length <= 80 && !pricePattern.test(name)) {
      const image = pending[i - 1]!.image;
      addProduct(name, price, image === used ? null : image);
      used = image;
    }
  }

  const priced = new Set(products.flatMap((p) => [p.name, p.price]));
  const seen = new Set<string>();
  let total = 0;
  for (const b of pending) {
    // Short fragments are usually menus, buttons and credits rather than writing.
    if (priced.has(b.text) || seen.has(b.text)) continue;
    if (b.type === "p" && b.text.length < 40 && !/[.!?]$/.test(b.text)) continue;
    seen.add(b.text);
    if (blocks.length >= 60 || total > 20_000) break;
    blocks.push({ type: b.type, text: b.text });
    total += b.text.length;
  }

  const ogImage = meta["og:image"] ? absolute(meta["og:image"], base) : null;
  // The page's own share image leads; product photos keep pointing at the same pictures.
  if (ogImage && !imageIndex.has(ogImage)) {
    images.unshift({ src: ogImage, alt: "" });
    for (const p of products) if (p.image !== null) p.image += 1;
  }
  const words = blocks.reduce((n, b) => n + b.text.split(" ").length, 0);
  const kind: ImportKind =
    products.length >= 3 ? "shop" : images.length >= 6 && words < 250 ? "portfolio" : "article";
  const theme = (meta["theme-color"] ?? "").trim();
  return {
    title: clean(meta["og:title"] ?? title ?? "").slice(0, 100) || base.hostname,
    siteName: clean(meta["og:site_name"] ?? "").slice(0, 60) || base.hostname.replace(/^www\./, ""),
    description: clean(meta["og:description"] ?? meta.description ?? "").slice(0, 400),
    accent: /^#[0-9a-fA-F]{6}$/.test(theme) ? theme.toLowerCase() : null,
    kind,
    blocks,
    images: images.slice(0, 24),
    products,
  };
}

/** What the import screen edits. Photos are Smudge assets by now, never outside URLs. */
export const importedPageSchema = z
  .object({
    kind: z.enum(importKinds),
    title: z.string().trim().min(1).max(100),
    siteName: z.string().trim().max(60),
    intro: z.string().trim().max(400),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
    blocks: z
      .array(
        z
          .object({ type: z.enum(["h", "p", "quote"]), text: z.string().trim().min(1).max(600) })
          .strict(),
      )
      .max(60),
    images: z
      .array(z.object({ assetId: z.string().uuid(), alt: z.string().max(200) }).strict())
      .max(12),
    cover: z.string().uuid().nullable(),
    products: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            price: z.string().trim().max(30),
            assetId: z.string().uuid().nullable(),
          })
          .strict(),
      )
      .max(24),
    source: z
      .object({
        url: z
          .string()
          .url()
          .max(500)
          .refine((u) => /^https?:\/\//.test(u), "Use a web link"),
        host: z.string().max(120),
      })
      .strict(),
  })
  .strict();
export type ImportedPage = z.infer<typeof importedPageSchema>;

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const baseCss = (accent: string) => `
:root{--accent:${accent};--ink:#16130f;--soft:#6d655b;--paper:#fbf8f2;--card:#fff;--line:#e7e0d4}
html[data-theme=dark]{--ink:#f3eee6;--soft:#b7ad9f;--paper:#171512;--card:#221f1b;--line:#38332c}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 20px 40px}
.eyebrow{display:inline-block;margin:0 0 10px;padding:4px 10px;border-radius:99px;background:var(--accent);color:#fff;font:700 11px/1.4 system-ui;letter-spacing:.08em;text-transform:uppercase}
h1{margin:0 0 12px;font:800 clamp(30px,7vw,52px)/1.04 Georgia,serif;letter-spacing:-.02em}
h2{margin:30px 0 8px;font:700 22px/1.25 Georgia,serif}
.intro{margin:0 0 22px;color:var(--soft);font-size:19px}
.cover{display:block;width:100%;max-height:440px;object-fit:cover;border-radius:18px;margin:0 0 24px;background:var(--line)}
p{margin:0 0 16px}
blockquote{margin:22px 0;padding:4px 0 4px 18px;border-left:4px solid var(--accent);font:italic 21px/1.45 Georgia,serif}
figure{margin:22px 0}
figure img{display:block;width:100%;border-radius:14px;background:var(--line)}
figcaption{margin-top:6px;color:var(--soft);font-size:13px}
.from{margin-top:36px;padding-top:16px;border-top:1px solid var(--line);color:var(--soft);font-size:13px;overflow-wrap:anywhere}
.from strong{color:var(--ink)}
`;

/** Builds the post package and its feed details. Every string is escaped; there is no script. */
export function buildImportedPage(input: unknown): {
  package: Experience;
  metadata: Metadata;
} {
  const page = importedPageSchema.parse(input);
  const accent =
    page.accent ??
    (page.kind === "shop" ? "#1f8a5b" : page.kind === "portfolio" ? "#111111" : "#d2462f");
  const img = (id: string, alt: string, cls = "") =>
    `<img${cls ? ` class="${cls}"` : ""} src="asset:${id}" alt="${escape(alt)}" loading="lazy">`;
  const head = `<p class="eyebrow">${escape(page.siteName || page.source.host)}</p><h1>${escape(page.title)}</h1>${page.intro ? `<p class="intro">${escape(page.intro)}</p>` : ""}`;
  const text = (blocks: ImportedPage["blocks"], photos: ImportedPage["images"]) => {
    let out = "";
    let next = 0;
    blocks.forEach((b, i) => {
      out +=
        b.type === "h"
          ? `<h2>${escape(b.text)}</h2>`
          : b.type === "quote"
            ? `<blockquote>${escape(b.text)}</blockquote>`
            : `<p>${escape(b.text)}</p>`;
      // Photos are spread through the writing, one after every few paragraphs.
      if (i % 3 === 2 && next < photos.length) {
        const p = photos[next++]!;
        out += `<figure>${img(p.assetId, p.alt)}${p.alt ? `<figcaption>${escape(p.alt)}</figcaption>` : ""}</figure>`;
      }
    });
    for (const p of photos.slice(next)) out += `<figure>${img(p.assetId, p.alt)}</figure>`;
    return out;
  };
  const others = page.images.filter((i) => i.assetId !== page.cover);
  const coverAlt = page.images.find((i) => i.assetId === page.cover)?.alt ?? "";
  const cover = page.cover ? img(page.cover, coverAlt, "cover") : "";
  let body = "";
  let css = baseCss(accent);
  if (page.kind === "shop") {
    css += `.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;margin:8px 0 28px;padding:0;list-style:none}
.item{border-radius:16px;background:var(--card);border:1px solid var(--line);overflow:hidden}
.item img,.item .ph{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:var(--line)}
.item div{padding:10px 12px 12px}.item strong{display:block;font-size:15px;line-height:1.3}
.item div span{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:99px;background:var(--accent);color:#fff;font:700 13px system-ui}`;
    const items = page.products
      .map(
        (p) =>
          `<li class="item">${p.assetId ? img(p.assetId, p.name) : '<span class="ph" aria-hidden="true"></span>'}<div><strong>${escape(p.name)}</strong>${p.price ? `<span>${escape(p.price)}</span>` : ""}</div></li>`,
      )
      .join("");
    const used = new Set(page.products.map((p) => p.assetId));
    body = `${cover}${head}${items ? `<ul class="grid" role="list" aria-label="Products">${items}</ul>` : ""}${text(
      page.blocks,
      others.filter((i) => !used.has(i.assetId)),
    )}`;
  } else if (page.kind === "portfolio") {
    css += `.wall{columns:2 220px;column-gap:12px;margin:8px 0 24px}
.wall img{display:block;width:100%;margin:0 0 12px;border-radius:12px;break-inside:avoid;background:var(--line)}`;
    const photos = (
      page.cover ? [page.images.find((i) => i.assetId === page.cover)!, ...others] : page.images
    )
      .map((p) => img(p.assetId, p.alt))
      .join("");
    body = `${head}<div class="wall">${photos}</div>${text(page.blocks, [])}`;
  } else {
    body = `${cover}${head}${text(page.blocks, others)}`;
  }
  const from = `<p class="from">Imported from <strong>${escape(page.source.host)}</strong> · ${escape(page.source.url)}</p>`;
  const assets = [
    ...new Set([
      ...page.images.map((i) => i.assetId),
      ...page.products.flatMap((p) => (p.assetId ? [p.assetId] : [])),
    ]),
  ];
  if (assets.length > 12) throw new Error("Use at most 12 photos.");
  return {
    package: {
      manifest: {
        schemaVersion: 2,
        runtimeVersion: "web-v1",
        name: page.title,
        entrypoint: "index.html",
        capabilities: [],
        assets,
      },
      files: {
        "index.html": `<link rel="stylesheet" href="page.css"><main>${body}${from}</main>`,
        "page.css": css,
      },
    },
    metadata: {
      title: page.title,
      caption: page.intro,
      format: "custom",
      contributors: [],
      ...(page.cover ? { coverAssetId: page.cover } : {}),
      link: { label: page.kind === "shop" ? "See the shop" : "Open page" },
      source: page.source,
    },
  };
}
