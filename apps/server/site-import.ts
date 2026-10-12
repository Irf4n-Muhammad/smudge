import { z } from "zod";
import type { Actor } from "../../packages/core/src/index.js";
import { AppError, type SocialService } from "../../packages/core/src/social.js";
import { extractSite, type ImportedPage } from "../../packages/core/src/site-import.js";
import { fetchPage, fetchPhoto, type FetchOptions } from "./site-fetch.js";

export const importRequestSchema = z
  .object({
    url: z.string().trim().min(4).max(500),
    /** The person confirms the site is theirs, or that they may copy it. */
    permission: z.literal(true, { errorMap: () => ({ message: "PERMISSION_REQUIRED" }) }),
  })
  .strict();

/**
 * Reads a page once and returns a first version of the imported page for the person to edit.
 * Photos are downloaded and stored as that person's assets; nothing is published.
 */
export async function importSite(
  social: SocialService,
  actor: Actor,
  input: unknown,
  options: FetchOptions,
) {
  social.actor(actor);
  const { url: raw } = importRequestSchema.parse(input);
  const typed = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const page = await fetchPage(typed, options);
  const site = extractSite(page.html, page.url);
  if (!site.blocks.length && !site.images.length && !site.products.length)
    throw new AppError("SITE_EMPTY", 422);

  // Product photos first, so a shop keeps its pictures; then the page's own order. At most 12.
  const wanted: number[] = [];
  for (const p of site.products)
    if (p.image !== null && !wanted.includes(p.image)) wanted.push(p.image);
  site.images.forEach((_, i) => !wanted.includes(i) && wanted.push(i));
  const assets = new Map<number, { assetId: string; alt: string }>();
  const deadline = Date.now() + 20_000;
  for (let i = 0; i < wanted.length && assets.size < 12 && Date.now() < deadline; i += 4) {
    const batch = wanted.slice(i, i + 4);
    const photos = await Promise.all(batch.map((n) => fetchPhoto(site.images[n]!.src, options)));
    photos.forEach((bytes, j) => {
      if (!bytes || assets.size >= 12) return;
      const n = batch[j]!;
      const saved = social.upload(actor, {
        name: `imported-${n + 1}.webp`,
        mime: "image/webp",
        base64: bytes.toString("base64"),
      });
      assets.set(n, { assetId: saved.id, alt: site.images[n]!.alt });
    });
  }
  const images = [...assets.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
  const host = new URL(page.url).hostname.replace(/^www\./, "");
  const result: ImportedPage = {
    kind: site.kind,
    title: site.title,
    siteName: site.siteName,
    intro: site.description,
    accent: site.accent,
    blocks: site.blocks.map((b) => ({ ...b, text: b.text.slice(0, 600) })),
    images,
    cover: images[0]?.assetId ?? null,
    products: site.products.map((p) => ({
      name: p.name,
      price: p.price,
      assetId: p.image !== null ? (assets.get(p.image)?.assetId ?? null) : null,
    })),
    source: { url: page.url.slice(0, 500), host: host.slice(0, 120) },
  };
  return {
    page: result,
    found: {
      words: site.blocks.reduce((n, b) => n + b.text.split(" ").length, 0),
      photos: site.images.length,
      photosKept: images.length,
      products: site.products.length,
    },
  };
}
