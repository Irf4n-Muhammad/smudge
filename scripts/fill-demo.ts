import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { buildPost, startPostDesign } from "../packages/core/src/easy-post.js";
import type { PostStyle } from "../packages/core/src/easy-post.js";
import { photoId } from "../apps/server/seed-photos.js";

/**
 * Fills a few demo people with two weeks of posts and "right now" lines, so the Posts wall and
 * the Stories shelves (ADR 0058) can be seen full. Local playground only: it writes the demo
 * database directly, so stop `npm run dev` first and start it again after.
 *
 *   npm run build:core && node dist/scripts/fill-demo.js [people…]   (default: ines dani)
 */
type Photo = Parameters<typeof photoId>[0];
const posts: [PostStyle, string, string, Photo | null, number][] = [
  ["poster", "Sunday market run", "Mangoes, coffee, and a very patient dog.", "french-toast", 1.5],
  ["note", "Read less, but better", "", null, 3],
  ["gallery", "Lisbon light", "Every street ends in the sea.", "beach-sunset", 5],
  ["magazine", "The café I keep going back to", "Third window seat, always.", "cafe-room", 20],
  ["note", "Notes to self: slow down", "", null, 23],
  ["poster", "Gig night", "Ears still ringing.", "gig", 27],
  ["gallery", "Above the clouds", "Window seat paid off.", "above-clouds", 46],
  ["note", "A list of small wins", "Made bread. Called mum. Slept eight hours.", null, 50],
  ["poster", "Summit with the crew", "We were late and it was perfect.", "summit-friends", 70],
  ["magazine", "Workshop day", "Glue everywhere.", "workshop", 74],
  ["note", "Why I stopped posting daily", "", null, 98],
  ["gallery", "Latte art attempts", "Number six looks like a swan if you squint.", "latte", 120],
  ["poster", "Mountains, finally", "", "mountains", 146],
  ["note", "Things the cat taught me", "", null, 150],
];
const lines: [string, string, string | null, number][] = [
  ["listening", "Pink + White", "Frank Ocean", 0.7],
  ["place", "Rua das Flores", null, 4],
  ["thinking", "Should I paint the whole wall yellow?", null, 22],
  ["listening", "Holocene", "Bon Iver", 48],
  ["doing", "Repotting everything", null, 72],
];

const file = resolve(process.env.FORMA_DATA_DIR ?? ".local", "forma.sqlite");
if (!existsSync(file)) {
  console.error(`No demo database at ${file}. Run npm run dev once first.`);
  process.exit(1);
}
const store = await Store.open(file);
const service = new SocialService(store);
const people = process.argv.slice(2).length ? process.argv.slice(2) : ["ines", "dani"];
const hour = 3_600_000;
const now = Date.now();
for (const owner of people) {
  const mark = `fill-demo-v1:${owner}`;
  if (!store.get("user", owner) || store.get("system", mark)) {
    console.log(`${owner}: skipped (no such person, or filled already)`);
    continue;
  }
  const dated: [string, number][] = [];
  for (const [style, title, caption, photo, hoursAgo] of posts) {
    const built = buildPost(
      startPostDesign(style, {
        headline: title,
        text: caption || title,
        photos: photo ? [{ assetId: photoId(photo), caption: "" }] : [],
      }),
    );
    const draft = service.createDraft(
      { userId: owner },
      { package: built.package, metadata: { ...built.metadata, title, caption, contributors: [] } },
    );
    dated.push([service.publish({ userId: owner }, draft.id, draft.revision).id, hoursAgo]);
  }
  // Only a transaction writes the file, so the dates, the lines and the mark go in one.
  store.transaction(() => {
    // Spread over two weeks, so the shelves have days to sit on.
    for (const [id, hoursAgo] of dated) {
      const record = store.get<Record<string, unknown>>("post", id)!;
      store.put("post", id, {
        ...record,
        createdAt: new Date(now - hoursAgo * hour).toISOString(),
      });
    }
    for (const [kind, text, by, hoursAgo] of lines) {
      const id = randomUUID();
      store.put("now", id, {
        id,
        userId: owner,
        kind,
        text,
        ...(by ? { by } : {}),
        at: new Date(now - hoursAgo * hour).toISOString(),
      });
    }
    store.put("system", mark, { at: new Date(now).toISOString() });
  });
  console.log(`${owner}: ${posts.length} posts and ${lines.length} lines added`);
}
