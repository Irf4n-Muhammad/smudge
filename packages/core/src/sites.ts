import { z } from "zod";
import type { DraftView } from "../../contracts/src/experience.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { Publication, SocialService } from "./social.js";

/**
 * Websites as accounts: a brand, a media outlet or a place (a restaurant, a shop) that proved its
 * domain. Their posts are content like anyone's, with three rules that keep the feed about people:
 * every post must let you do something in place, they take at most one slot in five, and a site
 * you don't follow reaches you only once real people saved or remade its posts, in a small
 * "rising" slot.
 */
export const siteKinds = ["brand", "media", "place"] as const;
export type SiteKind = (typeof siteKinds)[number];
export const siteKindSchema = z.object({ kind: z.enum(siteKinds).nullable() }).strict();

/** One site post in this many feed slots, at most. */
export const SITE_EVERY = 5;
/** One rising slot (a site you don't follow, brought by people) in this many. */
export const RISING_EVERY = 10;
/** How many different people must have saved or remade a post for it to rise. */
export const RISING_PEOPLE = 2;

/** Permissions that make a post something you do, not only look at. */
const doing = [
  "plan.join",
  "answers.write",
  "polls.vote",
  "contributions.create",
  "reactions.place",
];

/** Whether a post lets you do something where it is: a link, a plan, a vote, a fill-in. */
export function hasAction(draft: Pick<DraftView, "package" | "metadata">) {
  if (draft.metadata.link?.url) return true;
  return draft.package.manifest.capabilities.some((c) => doing.includes(c));
}

export interface Mixed<T> {
  post: T;
  rising?: true;
}

export class SitesService {
  constructor(
    private readonly social: SocialService,
    /** Whether the person proved a website is theirs; the server asks the own-site service. */
    private readonly verifiedSite: (userId: string) => boolean,
  ) {
    const guard = social.publishGuard;
    social.publishGuard = (actorId, draft) => {
      guard(actorId, draft);
      if (this.kindOf(actorId) && !hasAction(draft))
        throw new AppError("SITE_POST_NEEDS_ACTION", 400);
    };
  }

  kindOf(userId: string): SiteKind | null {
    return this.social.store.get<{ kind: SiteKind }>("site-kind", userId)?.kind ?? null;
  }

  /** Says the account is a brand, media or place (or a person again, with null). */
  declare(actor: Actor, input: unknown) {
    const me = this.social.actor(actor);
    const { kind } = siteKindSchema.parse(input);
    if (kind && !this.verifiedSite(me)) throw new AppError("SITE_NOT_VERIFIED", 403);
    this.social.store.transaction(() => {
      if (kind) this.social.store.put("site-kind", me, { kind });
      else this.social.store.remove("site-kind", me);
    });
    return { kind };
  }

  /** Runs inside the caller's transaction (account deletion, or leaving one's website). */
  erase(userId: string) {
    this.social.store.remove("site-kind", userId);
  }

  /** How many different people, not the owner, saved or remade each post. */
  private broughtBy() {
    const store = this.social.store;
    const owners = new Map(store.all<Publication>("post").map((p) => [p.id, p.ownerId]));
    const people = new Map<string, Set<string>>();
    const add = (postId: string, userId: string) => {
      if (owners.get(postId) === userId) return;
      if (!people.has(postId)) people.set(postId, new Set());
      people.get(postId)!.add(userId);
    };
    for (const s of store.all<{ postId: string; userId: string }>("save")) add(s.postId, s.userId);
    for (const p of store.all<Publication>("post")) if (p.remixOf) add(p.remixOf, p.ownerId);
    return people;
  }

  /**
   * Orders a feed (newest first) so sites stay a minority: people's posts keep their order, a
   * followed site's post takes a slot only when no site post sits in the four before it, and a
   * site you don't follow appears only in every tenth slot, when enough people brought it.
   */
  mix<T extends { id: string; ownerId: string }>(viewerId: string, posts: T[]): Mixed<T>[] {
    const following = new Set(this.social.following({ userId: viewerId }));
    const brought = this.broughtBy();
    const people: T[] = [];
    const sites: T[] = [];
    const rising: T[] = [];
    for (const p of posts) {
      if (!this.kindOf(p.ownerId) || p.ownerId === viewerId) people.push(p);
      else if (following.has(p.ownerId)) sites.push(p);
      else if ((brought.get(p.id)?.size ?? 0) >= RISING_PEOPLE) rising.push(p);
    }
    const order = new Map(posts.map((p, i) => [p.id, i]));
    const out: Mixed<T>[] = [];
    let lastSite = -SITE_EVERY;
    while (people.length || sites.length || rising.length) {
      const slot = out.length;
      if ((slot + 1) % RISING_EVERY === 0 && rising.length) {
        out.push({ post: rising.shift()!, rising: true });
        lastSite = slot;
        continue;
      }
      const siteFits = sites.length && slot - lastSite >= SITE_EVERY;
      const siteFirst =
        siteFits && (!people.length || order.get(sites[0]!.id)! < order.get(people[0]!.id)!);
      if (siteFirst || (!people.length && sites.length)) {
        out.push({ post: sites.shift()! });
        lastSite = slot;
      } else if (people.length) out.push({ post: people.shift()! });
      else if (rising.length) {
        // Nothing else left: the rising posts close the feed rather than vanish.
        out.push({ post: rising.shift()!, rising: true });
        lastSite = slot;
      }
    }
    return out;
  }
}
