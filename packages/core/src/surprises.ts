import type { Surprise, SurprisePerson } from "../../contracts/src/surprises.js";
import type { Actor } from "./index.js";
import type { Answer, Publication, SocialService } from "./social.js";

/** How far back a friend's doing still counts as news. */
const WINDOW = 48 * 3600000;
const MAX = 6;

interface Rsvp {
  postId: string;
  userId: string;
  at: string;
}

/**
 * The small cards between feed posts: something a person you know just did that touches you.
 * Someone made their version of your post, friends answered your post, a friend joined a plan
 * you are in, a friend made their version of a post. Only the last 48 hours, newest first.
 */
export class SurpriseService {
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  /** Whether the viewer may see a person; the server installs the privacy rules. */
  peopleFilter: (viewerId: string, userId: string) => boolean = () => true;

  for(actor: Actor): Surprise[] {
    const me = this.social.actor(actor);
    const store = this.social.store;
    const since = this.now().getTime() - WINDOW;
    const recent = (at: string) => Date.parse(at) >= since;
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const person = (id: string): SurprisePerson | null => {
      const u = users.get(id);
      if (!u || id === me || !this.peopleFilter(me, id)) return null;
      return {
        id: u.id,
        name: u.name,
        handle: u.handle,
        initials: u.initials,
        color: u.color,
        ...(u.avatarAssetId ? { avatarAssetId: u.avatarAssetId } : {}),
      };
    };
    const posts = new Map(store.all<Publication>("post").map((p) => [p.id, p]));
    const visible = (p: Publication | undefined): p is Publication =>
      !!p && this.social.viewFilter(me, p);
    const following = new Set(this.social.following(actor));
    const out: Surprise[] = [];
    // Several people doing the same thing to one post make one card, not several.
    const group = (
      kind: Surprise["kind"],
      postId: string,
      title: string,
      events: { userId: string; at: string; openId?: string }[],
    ) => {
      const sorted = events.sort((a, b) => b.at.localeCompare(a.at));
      const people = [...new Set(sorted.map((e) => e.userId))]
        .map(person)
        .filter((p): p is SurprisePerson => !!p);
      if (!people.length) return;
      const shownIds = new Set(people.map((p) => p.id));
      const latest = sorted.find((e) => shownIds.has(e.userId))!;
      out.push({
        id: `${kind}:${postId}`,
        kind,
        postId: latest.openId ?? postId,
        title,
        people: people.slice(0, 3),
        count: people.length,
        at: latest.at,
      });
    };

    // Versions: of your posts, and anything your friends remade.
    const versionsOfMine = new Map<string, { userId: string; at: string; openId: string }[]>();
    for (const p of posts.values()) {
      if (!p.remixOf || p.ownerId === me || !recent(p.createdAt) || !visible(p)) continue;
      const root = posts.get(p.remixOf);
      if (root?.ownerId === me) {
        const list = versionsOfMine.get(root.id) ?? [];
        list.push({ userId: p.ownerId, at: p.createdAt, openId: p.id });
        versionsOfMine.set(root.id, list);
      } else if (following.has(p.ownerId) && visible(root)) {
        group("friend-version", p.id, root.metadata.title, [
          { userId: p.ownerId, at: p.createdAt },
        ]);
      }
    }
    for (const [rootId, events] of versionsOfMine)
      group("version-of-yours", rootId, posts.get(rootId)!.metadata.title, events);

    // Answers to your posts (tier lists, quizzes, picks).
    const answers = new Map<string, { userId: string; at: string }[]>();
    for (const a of store.all<Answer>("answer")) {
      const post = posts.get(a.postId);
      if (post?.ownerId !== me || a.userId === me || !recent(a.at)) continue;
      const list = answers.get(a.postId) ?? [];
      list.push({ userId: a.userId, at: a.at });
      answers.set(a.postId, list);
    }
    for (const [postId, events] of answers)
      group("answered-yours", postId, posts.get(postId)!.metadata.title, events);

    // Friends who just joined a plan you are in.
    const rsvps = store.all<Rsvp>("rsvp");
    const mine = new Set(rsvps.filter((r) => r.userId === me).map((r) => r.postId));
    const joined = new Map<string, { userId: string; at: string }[]>();
    for (const r of rsvps) {
      if (!mine.has(r.postId) || r.userId === me || !following.has(r.userId) || !recent(r.at))
        continue;
      if (!visible(posts.get(r.postId))) continue;
      const list = joined.get(r.postId) ?? [];
      list.push({ userId: r.userId, at: r.at });
      joined.set(r.postId, list);
    }
    for (const [postId, events] of joined)
      group("same-plan", postId, posts.get(postId)!.metadata.title, events);

    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX);
  }
}
