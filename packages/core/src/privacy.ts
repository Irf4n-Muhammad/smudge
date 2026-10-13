import type { User } from "../../contracts/src/experience.js";
import { privacyInputSchema } from "../../contracts/src/community.js";
import type { CommunityService } from "./community.js";
import { publicUser } from "./community.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

interface FollowRequest {
  userId: string;
  target: string;
  createdAt: string;
}

/**
 * Private accounts. Following one sends a request the owner accepts or declines, and their posts
 * are visible only to them and the people they accepted. Installs itself on SocialService, so the
 * feed, Explore, search, share links, mentions and profile pages all follow the same rule.
 * The profile page itself (name, bio, design) stays visible, as on other social apps.
 */
export class PrivacyService {
  constructor(
    private readonly social: SocialService,
    private readonly community: CommunityService,
    private readonly now: () => Date = () => new Date(),
  ) {
    const audience = social.viewFilter;
    social.viewFilter = (viewerId, post) =>
      audience(viewerId, post) && this.canSeePosts(viewerId, post.ownerId);
    social.needsRequest = (_actorId, targetId) => this.isPrivate(targetId);
  }
  private get store() {
    return this.social.store;
  }
  isPrivate(userId: string) {
    return this.store.get<User>("user", userId)?.private === true;
  }
  canSeePosts(viewerId: string, ownerId: string) {
    return (
      viewerId === ownerId ||
      !this.isPrivate(ownerId) ||
      (!!viewerId && !!this.store.get("follow", `${viewerId}:${ownerId}`))
    );
  }
  /** Going public accepts everyone who was waiting, since they could now follow anyway. */
  setPrivate(actor: Actor, input: unknown) {
    const me = this.social.actor(actor);
    const { private: on } = privacyInputSchema.parse(input);
    const user = this.store.get<User>("user", me)!;
    this.store.transaction(() => {
      const { private: _old, ...rest } = user;
      this.store.put("user", me, on ? { ...rest, private: true } : rest);
      if (!on) for (const r of this.incoming(me)) this.accept(me, r.userId);
    });
    return { private: on };
  }
  private incoming(me: string) {
    return this.store.all<FollowRequest>("follow-request").filter((r) => r.target === me);
  }
  /** People waiting for you to accept them, newest first. */
  requests(actor: Actor) {
    const me = this.social.actor(actor);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    return this.incoming(me)
      .filter((r) => this.community.canSeeUser(me, r.userId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ user: publicUser(users.get(r.userId))!, createdAt: r.createdAt }));
  }
  /** Accounts you asked to follow that haven't answered yet. */
  requested(actor: Actor) {
    const me = this.social.actor(actor);
    return this.store
      .all<FollowRequest>("follow-request")
      .filter((r) => r.userId === me)
      .map((r) => r.target);
  }
  private accept(me: string, from: string) {
    this.store.remove("follow-request", `${from}:${me}`);
    this.store.put("follow", `${from}:${me}`, { userId: from, target: me });
    this.social.emit({ type: "follow-accepted", actorId: me, targetId: from });
  }
  answer(actor: Actor, from: string, accept: boolean) {
    const me = this.social.actor(actor);
    if (!this.store.get("follow-request", `${from}:${me}`)) throw new AppError("NOT_FOUND", 404);
    this.store.transaction(() => {
      if (accept) this.accept(me, from);
      else this.store.remove("follow-request", `${from}:${me}`);
    });
    return { accepted: accept };
  }
  /** Private accounts can drop a follower, who then has to ask again. */
  removeFollower(actor: Actor, userId: string) {
    const me = this.social.actor(actor);
    if (!this.store.get("follow", `${userId}:${me}`)) throw new AppError("NOT_FOUND", 404);
    this.store.transaction(() => this.store.remove("follow", `${userId}:${me}`));
    return { removed: true };
  }
}
