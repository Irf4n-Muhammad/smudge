import { z } from "zod";
import type { User } from "../../contracts/src/experience.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

interface Rsvp {
  postId: string;
  userId: string;
  at: string;
  /** When the person said they were there; the plan's record of who actually came. */
  came?: string;
}
export interface PlanView {
  /** Everyone who is in, visible or not. */
  count: number;
  /** Everyone who said they were there. */
  cameCount: number;
  /** Whether the current viewer is in. */
  going: boolean;
  /** Whether the current viewer said they were there. */
  came: boolean;
  /** The people the viewer may see, newest first, at most `shown`. */
  people: {
    id: string;
    name: string;
    handle: string;
    initials: string;
    color: string;
    came: boolean;
  }[];
}
const shown = 40;
/** `going` adds or removes the viewer; `came` marks whether they were there (it implies being in). */
const joinSchema = z
  .object({ going: z.boolean().optional(), came: z.boolean().optional() })
  .strict()
  .refine((v) => v.going !== undefined || v.came !== undefined, "going or came is required");

/**
 * Plans (ADR 0029): a post people can join. The post declares `plan.read` and `plan.join`;
 * the host keeps one record per post and person, so the page can only ever add or remove the
 * viewer who tapped. Names are a post-level audience answer: whoever may open the post sees who
 * is in, minus people the viewer cannot see (blocks, hidden accounts).
 */
export class PlansService {
  /** Installed by the community layer: whether `viewerId` may see `userId` at all. */
  peopleFilter: (viewerId: string, userId: string) => boolean = () => true;
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {
    social.capabilityHandlers["plan.read"] = (actor, postId, _payload, preview) =>
      preview ? practice : this.view(actor, postId);
    social.capabilityHandlers["plan.join"] = (actor, postId, payload, preview) => {
      if (preview) throw new AppError("PREVIEW_READ_ONLY", 403);
      return this.join(actor, postId, payload);
    };
    social.postRemovers.push((postId) => {
      for (const key of this.store.ids("rsvp"))
        if (key.startsWith(`${postId}:`)) this.store.remove("rsvp", key);
    });
  }
  private get store() {
    return this.social.store;
  }
  private list(postId: string) {
    return this.store
      .all<Rsvp>("rsvp")
      .filter((r) => r.postId === postId)
      .sort((a, b) => b.at.localeCompare(a.at));
  }
  /** Only reached through `capability`, which has already checked the viewer may see the post. */
  view(actor: Actor, postId: string): PlanView {
    const viewerId = this.social.actor(actor);
    const all = this.list(postId);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const people = all
      .filter((r) => this.peopleFilter(viewerId, r.userId))
      .map((r) => [r, users.get(r.userId)] as const)
      .filter((pair): pair is readonly [Rsvp, User] => !!pair[1])
      .slice(0, shown)
      .map(([r, u]) => ({
        id: u.id,
        name: u.name,
        handle: u.handle,
        initials: u.initials,
        color: u.color,
        came: !!r.came,
      }));
    const me = all.find((r) => r.userId === viewerId);
    return {
      count: all.length,
      cameCount: all.filter((r) => r.came).length,
      going: !!me,
      came: !!me?.came,
      people,
    };
  }
  join(actor: Actor, postId: string, payload: unknown): PlanView {
    const userId = this.social.actor(actor);
    const { going, came } = joinSchema.parse(payload);
    const key = `${postId}:${userId}`;
    const now = this.now().toISOString();
    this.store.transaction(() => {
      const current = this.store.get<Rsvp>("rsvp", key);
      if (going === false) {
        this.store.remove("rsvp", key);
        return;
      }
      const next: Rsvp = current ?? { postId, userId, at: now };
      if (came === true) next.came = next.came ?? now;
      else if (came === false) delete next.came;
      this.store.put("rsvp", key, next);
    });
    return this.view(actor, postId);
  }
  /** Who is in, for the feed card and tests; the same audience rule as the page's own read. */
  of(actor: Actor, postId: string) {
    this.social.visiblePost(actor, postId);
    return this.view(actor, postId);
  }
}
const practice: PlanView = { count: 0, cameCount: 0, going: false, came: false, people: [] };
