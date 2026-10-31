import type { User } from "../../contracts/src/experience.js";
import {
  moderationActionSchema,
  peopleQuerySchema,
  suspendSchema,
} from "../../contracts/src/community.js";
import type { NotificationType, PersonView } from "../../contracts/src/community.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { Publication, SocialEvent, SocialService } from "./social.js";

interface Follow {
  userId: string;
  target: string;
}
interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  actorId: string | null;
  postId: string | null;
  createdAt: string;
  read: boolean;
}
interface PostReport {
  postId: string;
  userId: string;
  reason?: string;
  createdAt: string;
}
interface ProfileReport {
  ownerId: string;
  reporterId: string;
  createdAt: string;
}
interface WallReport {
  ownerId: string;
  noteId: string;
  reporterId: string;
  reason: string;
  createdAt: string;
}
interface WallNoteRecord {
  id: string;
  userId: string;
  text: string;
}
interface Resolution {
  action: "remove" | "restore" | "dismiss";
  by: string;
  at: string;
}

/**
 * Blocking, suspension, deletion state, notifications, people search and moderation. Installs
 * itself on SocialService so every existing read path (feed, runtime tickets, comments, likes,
 * capabilities) respects blocks, removals and suspensions without each one knowing about them.
 */
export class CommunityService {
  constructor(
    private readonly social: SocialService,
    private readonly isAdmin: (userId: string) => boolean,
    private readonly now: () => Date = () => new Date(),
  ) {
    const audience = social.viewFilter;
    social.viewFilter = (viewerId, post) =>
      audience(viewerId, post) && this.canSeePost(viewerId, post);
    social.relationGuard = (actorId, targetId) => {
      if (this.blockedEither(actorId, targetId) || this.hidden(targetId))
        throw new AppError("NOT_AVAILABLE", 403);
    };
    social.listeners.push((event) => this.onEvent(event));
    social.postRemovers.push((postId) => {
      for (const n of this.store.all<Notification>("notification"))
        if (n.postId === postId) this.store.remove("notification", n.id);
      this.store.remove("moderation", `post:${postId}`);
    });
  }
  private get store() {
    return this.social.store;
  }

  // Visibility ---------------------------------------------------------------------------
  isSuspended(userId: string) {
    return !!this.store.get("suspension", userId);
  }
  isDeleted(userId: string) {
    return !!this.store.get("deleted-user", userId);
  }
  /** Suspended and deleted people disappear for everyone else. */
  hidden(userId: string) {
    return this.isSuspended(userId) || this.isDeleted(userId);
  }
  blockedEither(a: string, b: string) {
    return !!this.store.get("block", `${a}:${b}`) || !!this.store.get("block", `${b}:${a}`);
  }
  isRemoved(postId: string) {
    return this.store.get<Resolution>("moderation", `post:${postId}`)?.action === "remove";
  }
  private canSeePost(viewerId: string, post: Publication) {
    if (this.isRemoved(post.id)) return false;
    if (post.ownerId === viewerId) return true;
    return !this.hidden(post.ownerId) && !this.blockedEither(viewerId, post.ownerId);
  }
  /** Whether `viewerId` may see `userId`'s profile, messages and comments at all. */
  canSeeUser(viewerId: string, userId: string) {
    return viewerId === userId || (!this.hidden(userId) && !this.blockedEither(viewerId, userId));
  }
  assertVisibleUser(actor: Actor, userId: string) {
    if (!this.canSeeUser(this.social.actor(actor), userId)) throw new AppError("NOT_FOUND", 404);
  }

  // Blocking -----------------------------------------------------------------------------
  /** Toggles a block. Blocking also ends follows in both directions. */
  block(actor: Actor, userId: string) {
    const me = this.social.actor(actor);
    if (userId === me || !this.store.get("user", userId)) throw new AppError("INVALID_USER");
    const key = `${me}:${userId}`;
    const blocked = !this.store.get("block", key);
    this.store.transaction(() => {
      if (!blocked) return this.store.remove("block", key);
      this.store.put("block", key, { userId: me, target: userId, at: this.now().toISOString() });
      this.store.remove("follow", `${me}:${userId}`);
      this.store.remove("follow", `${userId}:${me}`);
      this.store.remove("follow-request", `${me}:${userId}`);
      this.store.remove("follow-request", `${userId}:${me}`);
    });
    return { blocked };
  }
  blocked(actor: Actor) {
    const me = this.social.actor(actor);
    return this.store
      .all<{ userId: string; target: string }>("block")
      .filter((b) => b.userId === me)
      .map((b) => this.person(me, b.target))
      .filter((p): p is PersonView => !!p);
  }

  // Notifications ------------------------------------------------------------------------
  private onEvent(event: SocialEvent) {
    if (this.blockedEither(event.actorId, event.targetId)) return;
    const postId = "postId" in event ? event.postId : null;
    this.notify(event.targetId, event.type, event.actorId, postId);
  }
  /** Repeating an action refreshes its notification instead of stacking duplicates. */
  private notify(
    userId: string,
    type: NotificationType,
    actorId: string | null,
    postId: string | null,
  ) {
    const id = `${type}:${actorId ?? "-"}:${postId ?? "-"}:${userId}`;
    this.store.put("notification", id, {
      id,
      userId,
      type,
      actorId,
      postId,
      createdAt: this.now().toISOString(),
      read: false,
    } satisfies Notification);
  }
  notifications(actor: Actor) {
    const me = this.social.actor(actor);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const follows = this.follows();
    const comments = this.store.all<{
      postId: string;
      userId: string;
      text: string;
      createdAt: string;
    }>("comment");
    return this.mine(me)
      .slice(0, 50)
      .map((n) => {
        const post = n.postId ? this.store.get<Publication>("post", n.postId) : undefined;
        // The words of a comment or reply, so it can be read without opening the post.
        const said = ["comment", "reply"].includes(n.type)
          ? comments
              .filter((c) => c.postId === n.postId && c.userId === n.actorId)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.text
          : undefined;
        return {
          id: n.id,
          type: n.type,
          read: n.read,
          createdAt: n.createdAt,
          actor: n.actorId ? publicUser(users.get(n.actorId)) : null,
          post: post ? { id: post.id, title: post.metadata.title } : null,
          ...(said ? { text: said.length > 140 ? `${said.slice(0, 139)}…` : said } : {}),
          youFollow: !!n.actorId && follows.some((f) => f.userId === me && f.target === n.actorId),
        };
      });
  }
  private mine(me: string) {
    return this.store
      .all<Notification>("notification")
      .filter((n) => n.userId === me && (!n.actorId || this.canSeeUser(me, n.actorId)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  unread(actor: Actor) {
    return { count: this.mine(this.social.actor(actor)).filter((n) => !n.read).length };
  }
  markRead(actor: Actor) {
    const unread = this.mine(this.social.actor(actor)).filter((n) => !n.read);
    if (unread.length)
      this.store.transaction(() =>
        unread.forEach((n) => this.store.put("notification", n.id, { ...n, read: true })),
      );
    return { count: 0 };
  }

  // People -------------------------------------------------------------------------------
  private follows() {
    return this.store.all<Follow>("follow");
  }
  private person(me: string, userId: string, follows = this.follows()): PersonView | null {
    const user = this.store.get<User>("user", userId);
    if (!user) return null;
    return {
      ...publicUser(user)!,
      bio: user.bio,
      followers: follows.filter((f) => f.target === userId).length,
      following: follows.some((f) => f.userId === me && f.target === userId),
      requested: !!this.store.get("follow-request", `${me}:${userId}`),
      private: user.private === true,
      followsYou: follows.some((f) => f.userId === userId && f.target === me),
      // The same rule MessageService.canMessage applies when a message is sent.
      canMessage:
        follows.some((f) => f.userId === userId && f.target === me) ||
        this.store
          .all<{ from: string; to: string }>("message")
          .some((m) => m.from === userId && m.to === me),
    };
  }
  private candidates(me: string) {
    return this.social
      .users()
      .filter((u) => u.id !== me && this.canSeeUser(me, u.id) && !this.isDeleted(u.id));
  }
  /** Handle prefix first, then name word prefix, then anywhere in name or handle. */
  search(actor: Actor, query: unknown) {
    const me = this.social.actor(actor);
    const q = peopleQuerySchema.parse(query).replace(/^@/, "");
    const follows = this.follows();
    const rank = (u: User) => {
      const name = u.name.toLowerCase();
      if (u.handle.startsWith(q)) return 0;
      if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
      if (u.handle.includes(q) || name.includes(q)) return 2;
      return -1;
    };
    return this.candidates(me)
      .map((u) => ({ u, r: rank(u) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.u.name.localeCompare(b.u.name))
      .slice(0, 20)
      .map(({ u }) => this.person(me, u.id, follows)!);
  }
  /** People your follows follow, ranked by how many; then popular accounts. */
  suggestions(actor: Actor) {
    const me = this.social.actor(actor);
    const follows = this.follows();
    const mine = new Set(follows.filter((f) => f.userId === me).map((f) => f.target));
    const mutuals = new Map<string, number>();
    for (const f of follows)
      if (mine.has(f.userId)) mutuals.set(f.target, (mutuals.get(f.target) ?? 0) + 1);
    return this.candidates(me)
      .filter((u) => !mine.has(u.id))
      .map((u) => ({ ...this.person(me, u.id, follows)!, mutuals: mutuals.get(u.id) ?? 0 }))
      .sort((a, b) => b.mutuals - a.mutuals || b.followers - a.followers)
      .slice(0, 10);
  }

  // Moderation ---------------------------------------------------------------------------
  private admin(actor: Actor) {
    const me = this.social.actor(actor);
    // Hidden from everyone else rather than refused, so the panel's existence is not probeable.
    if (!this.isAdmin(me)) throw new AppError("NOT_FOUND", 404);
    return me;
  }
  canModerate(actor: Actor) {
    return this.isAdmin(this.social.actor(actor));
  }
  /** Open reports: anything reported after its last moderation decision. */
  reports(actor: Actor) {
    this.admin(actor);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const open = <T extends { createdAt: string }>(key: string, items: T[]) => {
      const decided = this.store.get<Resolution>("moderation", key);
      return items.filter((r) => !decided || r.createdAt > decided.at);
    };
    const byPost = new Map<string, PostReport[]>();
    for (const r of this.store.all<PostReport>("report"))
      byPost.set(r.postId, [...(byPost.get(r.postId) ?? []), r]);
    const byProfile = new Map<string, ProfileReport[]>();
    for (const r of this.store.all<ProfileReport>("profile-report"))
      byProfile.set(r.ownerId, [...(byProfile.get(r.ownerId) ?? []), r]);
    const items = [];
    for (const [postId, all] of byPost) {
      const list = open(`post:${postId}`, all);
      const post = this.store.get<Publication>("post", postId);
      if (!list.length || !post) continue;
      const reasons: Record<string, number> = {};
      for (const r of list) reasons[r.reason ?? "other"] = (reasons[r.reason ?? "other"] ?? 0) + 1;
      items.push({
        target: "post" as const,
        id: postId,
        title: post.metadata.title,
        caption: post.metadata.caption,
        owner: publicUser(users.get(post.ownerId)),
        ownerSuspended: this.isSuspended(post.ownerId),
        removed: this.isRemoved(postId),
        count: list.length,
        reasons,
        latest: list
          .map((r) => r.createdAt)
          .sort()
          .at(-1)!,
      });
    }
    for (const [ownerId, all] of byProfile) {
      const list = open(`profile:${ownerId}`, all);
      if (!list.length) continue;
      items.push({
        target: "profile" as const,
        id: ownerId,
        title: users.get(ownerId)?.name ?? ownerId,
        caption: users.get(ownerId)?.bio ?? "",
        owner: publicUser(users.get(ownerId)),
        ownerSuspended: this.isSuspended(ownerId),
        removed: false,
        count: list.length,
        reasons: { profile: list.length },
        latest: list
          .map((r) => r.createdAt)
          .sort()
          .at(-1)!,
      });
    }
    const byNote = new Map<string, WallReport[]>();
    for (const r of this.store.all<WallReport>("wall-report"))
      byNote.set(`${r.ownerId}:${r.noteId}`, [
        ...(byNote.get(`${r.ownerId}:${r.noteId}`) ?? []),
        r,
      ]);
    for (const [id, all] of byNote) {
      const list = open(`wall-note:${id}`, all);
      const note = this.wallNote(id);
      // A note its author or the wall's owner already took down needs no decision.
      if (!list.length || !note) continue;
      const reasons: Record<string, number> = {};
      for (const r of list) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      items.push({
        target: "wall-note" as const,
        id,
        title: `Note on ${users.get(all[0]!.ownerId)?.name ?? "someone"}'s wall`,
        caption: note.text,
        owner: publicUser(users.get(note.userId)),
        ownerSuspended: this.isSuspended(note.userId),
        removed: false,
        count: list.length,
        reasons,
        latest: list
          .map((r) => r.createdAt)
          .sort()
          .at(-1)!,
      });
    }
    return items.sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
  }
  moderate(actor: Actor, input: unknown) {
    const me = this.admin(actor);
    const { target, id, action } = moderationActionSchema.parse(input);
    if (target === "profile" && action !== "dismiss") throw new AppError("ACTION_NOT_SUPPORTED");
    if (target === "wall-note") return this.moderateWallNote(me, id, action);
    const post = target === "post" ? this.store.get<Publication>("post", id) : undefined;
    if (target === "post" && !post) throw new AppError("NOT_FOUND", 404);
    if (target === "profile" && !this.store.get("user", id)) throw new AppError("NOT_FOUND", 404);
    // Covers every report seen so far even if report and server clocks disagree.
    const seen =
      target === "post"
        ? this.store.all<PostReport>("report").filter((r) => r.postId === id)
        : this.store.all<ProfileReport>("profile-report").filter((r) => r.ownerId === id);
    const at = [this.now().toISOString(), ...seen.map((r) => r.createdAt)].sort().at(-1)!;
    this.store.transaction(() => {
      this.store.put("moderation", `${target}:${id}`, {
        action,
        by: me,
        at,
      } satisfies Resolution);
      if (post && action === "remove") this.notify(post.ownerId, "post-removed", null, post.id);
    });
    return { ok: true };
  }
  /** `id` is `ownerId:noteId`; notes live in the owner's live wall. */
  private wallNote(id: string) {
    const [ownerId, noteId] = id.split(":");
    const notes = this.store.get<WallNoteRecord[]>("profile-wall", `owner:${ownerId}`) ?? [];
    return notes.find((n) => n.id === noteId) ?? null;
  }
  private moderateWallNote(me: string, id: string, action: "remove" | "restore" | "dismiss") {
    if (action === "restore") throw new AppError("ACTION_NOT_SUPPORTED");
    const [ownerId, noteId] = id.split(":");
    if (!this.wallNote(id)) throw new AppError("NOT_FOUND", 404);
    const seen = this.store
      .all<WallReport>("wall-report")
      .filter((r) => r.ownerId === ownerId && r.noteId === noteId);
    const at = [this.now().toISOString(), ...seen.map((r) => r.createdAt)].sort().at(-1)!;
    this.store.transaction(() => {
      this.store.put("moderation", `wall-note:${id}`, { action, by: me, at } satisfies Resolution);
      if (action === "remove") {
        const notes = this.store.get<WallNoteRecord[]>("profile-wall", `owner:${ownerId}`) ?? [];
        this.store.put(
          "profile-wall",
          `owner:${ownerId}`,
          notes.filter((n) => n.id !== noteId),
        );
      }
    });
    return { ok: true };
  }
  suspend(actor: Actor, userId: string, input: unknown) {
    const me = this.admin(actor);
    const { suspended, note } = suspendSchema.parse(input);
    if (userId === me || this.isAdmin(userId) || !this.store.get("user", userId))
      throw new AppError("INVALID_USER");
    this.store.transaction(() =>
      suspended
        ? this.store.put("suspension", userId, { by: me, at: this.now().toISOString(), note })
        : this.store.remove("suspension", userId),
    );
    return { suspended };
  }

  /** Called inside the account-deletion transaction. */
  erase(userId: string) {
    const s = this.store;
    const user = s.get<User>("user", userId);
    for (const f of this.follows())
      if (f.userId === userId || f.target === userId) s.remove("follow", `${f.userId}:${f.target}`);
    for (const key of s.ids("follow-request"))
      if (key.split(":").includes(userId)) s.remove("follow-request", key);
    for (const kind of ["like", "save", "reaction", "answer"])
      for (const r of s.all<{ postId: string; userId: string }>(kind))
        if (r.userId === userId) s.remove(kind, `${r.postId}:${r.userId}`);
    for (const b of s.all<{ userId: string; target: string }>("block"))
      if (b.userId === userId || b.target === userId) s.remove("block", `${b.userId}:${b.target}`);
    for (const n of s.all<Notification>("notification"))
      if (n.userId === userId || n.actorId === userId) s.remove("notification", n.id);
    for (const c of s.all<{ id: string; ownerId: string; partnerId?: string }>("chapter"))
      if (c.ownerId === userId || c.partnerId === userId) s.remove("chapter", c.id);
    for (const r of s.all<{ id: string; from: string; to: string }>("partner-request"))
      if (r.from === userId || r.to === userId) s.remove("partner-request", r.id);
    for (const id of s.ids("email-claim"))
      if (s.get<{ userId: string }>("email-claim", id)?.userId === userId)
        s.remove("email-claim", id);
    for (const m of s.all<{ id: string; from: string; to: string }>("message"))
      if (m.from === userId || m.to === userId) s.remove("message", m.id);
    // Wall notes carry the author's words and name: drop theirs everywhere, and their own wall.
    for (const key of s.ids("profile-wall")) {
      const notes = s.get<{ userId: string }[]>("profile-wall", key) ?? [];
      if (key === `owner:${userId}`) s.remove("profile-wall", key);
      else if (notes.some((n) => n.userId === userId))
        s.put(
          "profile-wall",
          key,
          notes.filter((n) => n.userId !== userId),
        );
    }
    for (const r of s.all<WallReport>("wall-report"))
      if (r.reporterId === userId || r.ownerId === userId)
        s.remove("wall-report", `${r.ownerId}:${r.noteId}:${r.reporterId}`);
    s.put("deleted-user", userId, { at: this.now().toISOString() });
    if (user)
      s.put("user", userId, {
        id: userId,
        name: "Deleted account",
        handle: `deleted.${userId.slice(-8)}`,
        initials: "–",
        color: "#dddddd",
        bio: "",
      } satisfies User);
  }
}

export function publicUser(user: User | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    initials: user.initials,
    color: user.color,
    ...(user.avatarAssetId ? { avatarAssetId: user.avatarAssetId } : {}),
  };
}
