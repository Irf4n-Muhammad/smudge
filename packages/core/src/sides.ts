import type { DraftView } from "../../contracts/src/experience.js";
import {
  EVERYDAY,
  activeSideSchema,
  feedLayoutSchema,
  shareInputSchema,
  sideById,
  sides,
} from "../../contracts/src/sides.js";
import type {
  FeedLayout,
  Side,
  SideHome,
  SideId,
  SidePlan,
  SideRegular,
  SidesView,
} from "../../contracts/src/sides.js";
import { collectionById } from "../../contracts/src/identity.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { Publication, SocialService } from "./social.js";

interface Membership {
  sideId: SideId;
  userId: string;
  since: string;
}
interface SideState {
  active?: SideId;
  layout?: FeedLayout;
}

/**
 * Sides (ADR 0027): one account, many sides. Membership is a record per side and person;
 * everyone is in Everyday. The active side decides what the feed shows and where the composer
 * posts. A private side's posts are hidden from non-members everywhere (viewFilter), while a
 * public side's posts are visible but only *listed* inside that side (feedFilter), unless the
 * writer shared them to Everyday. Rules live here; HTTP only forwards.
 */
export class SidesService {
  /** Installed by the community layer: whether `viewerId` may see `userId` at all. */
  peopleFilter: (viewerId: string, userId: string) => boolean = () => true;
  /** Installed by the plans layer: the side's plans the viewer may open. */
  planLister: (actor: Actor, sideId: SideId) => SidePlan[] = () => [];
  /** Installed by the plans layer: who comes most often to the side's plans (ADR 0034). */
  regularLister: (actor: Actor, sideId: SideId) => SideRegular[] = () => [];
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {
    const audience = social.viewFilter;
    social.viewFilter = (viewerId, post) => audience(viewerId, post) && this.canSee(viewerId, post);
    const listed = social.feedFilter;
    social.feedFilter = (viewerId, post) => listed(viewerId, post) && this.inFeed(viewerId, post);
    social.publishGuard = (actorId, draft) => this.checkDraft(actorId, draft);
    social.postRemovers.push((postId) => this.store.remove("side-share", postId));
  }
  private get store() {
    return this.social.store;
  }
  /** Other layers probe the view filter with a bare `{ownerId}`; that stands for Everyday. */
  sideOf(post: { metadata?: { side?: string | undefined } | undefined }): SideId {
    return post.metadata?.side ?? EVERYDAY;
  }
  isMember(userId: string, sideId: SideId) {
    return sideId === EVERYDAY || !!this.store.get("side-member", `${sideId}:${userId}`);
  }
  /** Sides this person is in, Everyday first, then in the order they joined. */
  memberships(userId: string): Side[] {
    const joined = this.store
      .all<Membership>("side-member")
      .filter((m) => m.userId === userId)
      .sort((a, b) => a.since.localeCompare(b.since))
      .map((m) => sideById(m.sideId))
      .filter((s): s is Side => !!s);
    return [sideById(EVERYDAY)!, ...joined];
  }
  private state(userId: string) {
    return this.store.get<SideState>("side-state", userId) ?? {};
  }
  /** The side the feed and composer are in; falls back to Everyday once you leave a side. */
  active(userId: string): SideId {
    const chosen = this.state(userId).active;
    return chosen && this.isMember(userId, chosen) && sideById(chosen) ? chosen : EVERYDAY;
  }
  layout(userId: string): FeedLayout {
    return this.state(userId).layout ?? "separate";
  }
  shared(postId: string) {
    return !!this.store.get("side-share", postId);
  }
  /** A private side's posts are for members only; sharing to Everyday opens a post to all. */
  canSee(viewerId: string, post: Publication) {
    const side = sideById(this.sideOf(post));
    if (!side) return viewerId === post.ownerId;
    return !side.private || this.isMember(viewerId, side.id) || this.shared(post.id);
  }
  /** Listed in the feed: the active side's posts, or all of yours together in the mixed layout. */
  inFeed(viewerId: string, post: Publication) {
    const side = this.sideOf(post);
    if (this.layout(viewerId) === "mixed")
      return this.isMember(viewerId, side) || this.shared(post.id);
    const active = this.active(viewerId);
    return side === active || (active === EVERYDAY && this.shared(post.id));
  }
  private checkDraft(actorId: string, draft: DraftView) {
    const side = this.sideOf(draft);
    if (!sideById(side)) throw new AppError("SIDE_UNKNOWN", 400);
    if (!this.isMember(actorId, side)) throw new AppError("SIDE_NOT_JOINED", 403);
  }

  me(actor: Actor): SidesView {
    const userId = this.social.actor(actor);
    const mine = this.memberships(userId);
    const have = new Set(mine.map((s) => s.id));
    return {
      active: this.active(userId),
      layout: this.layout(userId),
      mine,
      open: sides.filter((s) => !have.has(s.id) && !s.private && s.entry === "open"),
    };
  }
  /**
   * A side's home (ADR 0033): the side, who is in it, its plans and how much is posted there.
   * A private side answers only to members, with the same "not found" as a side that does not
   * exist. Counts cover everyone; the people shown are those the viewer may see.
   */
  home(actor: Actor, sideId: string): SideHome {
    const viewerId = this.social.actor(actor);
    const side = sideById(sideId);
    const member = !!side && this.isMember(viewerId, side.id);
    if (!side || (side.private && !member)) throw new AppError("NOT_FOUND", 404);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const joined =
      side.id === EVERYDAY
        ? [...users.values()].map((u) => ({ userId: u.id, since: "" }))
        : this.store
            .all<Membership>("side-member")
            .filter((m) => m.sideId === side.id && users.has(m.userId))
            .sort((a, b) => b.since.localeCompare(a.since));
    const mine = joined.find((m) => m.userId === viewerId);
    const people = joined
      .filter((m) => this.peopleFilter(viewerId, m.userId))
      .slice(0, 8)
      .map((m) => users.get(m.userId)!)
      .map(({ id, name, handle, initials, color, avatarAssetId }) => ({
        id,
        name,
        handle,
        initials,
        color,
        ...(avatarAssetId ? { avatarAssetId } : {}),
      }));
    const posts = this.store
      .all<Publication>("post")
      .filter((p) => this.sideOf(p) === side.id && this.social.viewFilter(viewerId, p)).length;
    return {
      side,
      member,
      ...(member && mine?.since ? { since: mine.since } : {}),
      members: { count: joined.length, people },
      plans: this.planLister(actor, side.id),
      posts,
      regulars: this.regularLister(actor, side.id),
    };
  }
  /** Membership granted by the system (seeds, an organisation's chapter); never an HTTP path. */
  grant(userId: string, sideId: SideId) {
    if (!sideById(sideId) || this.isMember(userId, sideId)) return;
    this.store.put("side-member", `${sideId}:${userId}`, {
      sideId,
      userId,
      since: this.now().toISOString(),
    } satisfies Membership);
  }
  join(actor: Actor, sideId: string) {
    const userId = this.social.actor(actor);
    const side = sideById(sideId);
    // A private side is not acknowledged to outsiders, so the answer is the same as for no side.
    if (!side || side.private) throw new AppError("NOT_FOUND", 404);
    if (side.entry !== "open") throw new AppError("SIDE_INVITE_ONLY", 403);
    this.store.transaction(() => this.grant(userId, side.id));
    return this.me(actor);
  }
  /** Leaving keeps your posts in the side; they come back into view if you rejoin. */
  leave(actor: Actor, sideId: string) {
    const userId = this.social.actor(actor);
    if (sideId === EVERYDAY) throw new AppError("SIDE_REQUIRED", 400);
    if (!this.store.get("side-member", `${sideId}:${userId}`)) throw new AppError("NOT_FOUND", 404);
    this.store.transaction(() => this.store.remove("side-member", `${sideId}:${userId}`));
    return this.me(actor);
  }
  /** An organisation's side opens with its chapter (invite or email); called inside that transaction. */
  joinByOrg(userId: string, orgId: string) {
    for (const side of sides) if (side.orgId === orgId) this.grant(userId, side.id);
  }
  /** A new chapter opens its organisation's side and, for a stamp, its collection's side. */
  joinByChapter(chapter: { ownerId: string; orgId?: string; collection?: string }) {
    if (chapter.orgId) this.joinByOrg(chapter.ownerId, chapter.orgId);
    const side = chapter.collection ? collectionById(chapter.collection)?.side : undefined;
    if (side) this.grant(chapter.ownerId, side);
  }
  setActive(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const { side } = activeSideSchema.parse(input);
    if (!sideById(side) || !this.isMember(userId, side)) throw new AppError("NOT_FOUND", 404);
    this.store.transaction(() =>
      this.store.put("side-state", userId, { ...this.state(userId), active: side }),
    );
    return this.me(actor);
  }
  setLayout(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const { layout } = feedLayoutSchema.parse(input);
    this.store.transaction(() =>
      this.store.put("side-state", userId, { ...this.state(userId), layout }),
    );
    return this.me(actor);
  }
  /** The writer decides: a post from a side can also appear in Everyday, for everyone. */
  share(actor: Actor, postId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const { everyday } = shareInputSchema.parse(input);
    const post = this.social.visiblePost(actor, postId);
    if (post.ownerId !== userId) throw new AppError("FORBIDDEN", 403);
    if (this.sideOf(post) === EVERYDAY) throw new AppError("SIDE_ALREADY_EVERYDAY", 400);
    this.store.transaction(() => {
      if (everyday) this.store.put("side-share", postId, { postId, at: this.now().toISOString() });
      else this.store.remove("side-share", postId);
    });
    return { everyday };
  }
  /** Per post, for the card: which side it is from and whether it is also in Everyday. */
  tag(post: { id: string; metadata: { side?: string | undefined } }) {
    const side = sideById(this.sideOf(post));
    return side && side.id !== EVERYDAY
      ? {
          side: { id: side.id, name: side.name, accent: side.accent },
          shared: this.shared(post.id),
        }
      : {};
  }
}
