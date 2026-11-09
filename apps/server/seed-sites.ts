import type { User } from "../../packages/contracts/src/experience.js";
import type { Publication, SocialService } from "../../packages/core/src/social.js";
import { buildPost, startPostDesign } from "../../packages/core/src/easy-post.js";

/**
 * Three websites living as accounts: Lumen Coffee (a place Alex follows), Northline (a brand
 * Alex doesn't follow, but Maya and Leo saved its drop, so it rises) and The Weekender (a media
 * outlet nobody brought, so it stays out of Alex's feed). Each post has a link to act on.
 */
const accounts: (User & { kind: "brand" | "media" | "place" })[] = [
  {
    id: "lumen",
    name: "Lumen Coffee",
    handle: "lumen.coffee",
    initials: "LC",
    color: "#f0dcc0",
    bio: "Small-batch roaster and café. Open 7 to 7.",
    kind: "place",
  },
  {
    id: "northline",
    name: "Northline",
    handle: "northline",
    initials: "N",
    color: "#cdd8d0",
    bio: "Outerwear for cities that rain.",
    kind: "brand",
  },
  {
    id: "weekender",
    name: "The Weekender",
    handle: "theweekender",
    initials: "W",
    color: "#e8e1f5",
    bio: "Things to do this weekend, every Friday.",
    kind: "media",
  },
];
const posts = [
  {
    owner: "lumen",
    hours: 30,
    kicker: "Today only",
    headline: "Kenyan *natural*, on pour-over",
    caption: "Twelve bags left. Reserve one and pick it up today.",
    link: { label: "Reserve a bag", url: "https://lumen.example/reserve" },
  },
  {
    owner: "northline",
    hours: 40,
    kicker: "Drop 04",
    headline: "The *rain shell*, in moss",
    caption: "Two hundred made. Try it on at the shop or order here.",
    link: { label: "See the drop", url: "https://northline.example/drop-04" },
  },
  {
    owner: "weekender",
    hours: 20,
    kicker: "This weekend",
    headline: "Ten things, *none indoors*",
    caption: "Night markets, a river swim and a film under a bridge.",
    link: { label: "Read the list", url: "https://weekender.example/this-weekend" },
  },
];

export function seedSites(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-sites-v1")) return;
  store.transaction(() => {
    for (const { kind, ...user } of accounts)
      if (!store.get("user", user.id)) {
        store.put("user", user.id, user);
        store.put("site-kind", user.id, { kind });
      }
  });
  const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
  const made = new Map<string, string>();
  for (const p of posts) {
    const built = buildPost(startPostDesign("poster", { kicker: p.kicker, headline: p.headline }));
    const actor = { userId: p.owner };
    const draft = service.createDraft(actor, {
      package: built.package,
      metadata: { ...built.metadata, caption: p.caption, contributors: [], link: p.link },
    });
    const post = service.publish(actor, draft.id, draft.revision);
    made.set(p.owner, post.id);
    const stored = store.get<Publication>("post", post.id);
    if (stored) store.put("post", post.id, { ...stored, createdAt: hoursAgo(p.hours) });
  }
  store.transaction(() => {
    if (store.get("user", "you"))
      store.put("follow", "you:lumen", { userId: "you", target: "lumen" });
    const drop = made.get("northline");
    for (const userId of ["maya", "leo"])
      if (drop && store.get("user", userId))
        store.put("save", `${drop}:${userId}`, { postId: drop, userId });
    store.put("system", "seed-sites-v1", { complete: true });
  });
}
