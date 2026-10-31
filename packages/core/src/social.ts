import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  contributionSchema,
  draftInputSchema,
  experienceSchema,
  progressSchema,
} from "../../contracts/src/experience.js";
import type { DraftView, Experience, PostView, User } from "../../contracts/src/experience.js";
import type { Actor } from "./index.js";
import { Store } from "./database.js";
import { normalizeFill } from "./fill.js";

/**
 * Nobody is signed in. The viewer every audience rule is asked about for a share link
 * (`viewFilter`, `canSeeUser`); never a user id, so it can never own or write anything.
 */
export const GUEST = "";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}
export interface Publication extends DraftView {
  digest: string;
  createdAt: string;
  sourceDraftId: string;
  /** Set when the owner republishes the post's draft; the post keeps its id and place. */
  editedAt?: string | undefined;
}
export interface Asset {
  id: string;
  ownerId: string;
  mime: string;
  base64: string;
  name: string;
}
export interface Note {
  id: string;
  postId: string;
  userId: string;
  text: string;
  createdAt: string;
  assetId?: string | undefined;
  /** Comments only: the top-level comment this one answers. Replies are one level deep. */
  parentId?: string | undefined;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const reportReasons = ["spam", "harassment", "nudity", "violence", "fake", "other"] as const;
export const reportReasonSchema = z.enum(reportReasons);

/** `@handle` mentions in free text, lowercased, first ten distinct. */
export function mentionedHandles(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:^|[^a-z0-9._@])@([a-z0-9._]{3,24})/gi)) {
    // A sentence can end right after a handle: "thanks @budi."
    const handle = match[1]!.toLowerCase().replace(/\.+$/, "");
    if (handle.length >= 3) found.add(handle);
    if (found.size === 10) break;
  }
  return [...found];
}
export function packageDigest(value: Experience) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
/** Something one person did to another's account or post; used for notifications. */
export type SocialEvent =
  | { type: "follow"; actorId: string; targetId: string }
  | {
      type: "like" | "comment" | "reaction" | "reply" | "mention";
      actorId: string;
      targetId: string;
      postId: string;
    }
  | {
      type: "partner-request" | "follow-request" | "follow-accepted" | "gift";
      actorId: string;
      targetId: string;
    };

export class SocialService {
  /** Called inside the transaction that records the action, so side effects commit with it. */
  listeners: ((event: SocialEvent) => void)[] = [];
  /** Relationship rule installed by the community layer (blocks); throws to refuse. */
  relationGuard: (actorId: string, targetId: string) => void = () => {};
  /** Audience rule installed by the identity layer (circle-only moments). */
  viewFilter: (viewerId: string, post: Publication) => boolean = () => true;
  /** Post capabilities implemented outside this module, keyed by method. */
  capabilityHandlers: Record<
    string,
    (actor: Actor, postId: string, payload: unknown, preview: boolean) => unknown
  > = {};
  /** Cleanup for records other layers keep per post; called inside the deletion transaction. */
  postRemovers: ((postId: string) => void)[] = [];
  /** Installed by the privacy layer: following a private account sends a request instead. */
  needsRequest: (actorId: string, targetId: string) => boolean = () => false;
  /** Refuses republishing over a post another layer owns the meaning of (moments); throws. */
  editGuard: (post: Publication) => void = () => {};
  /** Checks a draft may be published by this actor (sides: membership of the post's side); throws. */
  publishGuard: (actorId: string, draft: DraftView) => void = () => {};
  /**
   * Which visible posts belong in this viewer's feed right now (sides: the active side). Unlike
   * viewFilter it does not hide a post: a post outside the feed still opens by its link.
   */
  feedFilter: (viewerId: string, post: Publication) => boolean = () => true;
  constructor(public readonly store: Store) {}
  emit(event: SocialEvent) {
    if (event.actorId === event.targetId) return;
    for (const listener of this.listeners) listener(event);
  }
  users() {
    return this.store.all<User>("user");
  }
  actor(actor: Actor) {
    if (!actor || !this.store.get<User>("user", actor.userId))
      throw new AppError("UNAUTHENTICATED", 401);
    return actor.userId;
  }
  validate(input: unknown) {
    const result = experienceSchema.safeParse(input);
    return result.success
      ? { valid: true, capabilities: result.data.manifest.capabilities }
      : {
          valid: false,
          issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        };
  }
  private checkAssets(actor: Actor, experience: Experience, coverAssetId?: string) {
    if (
      coverAssetId &&
      (experience.manifest.schemaVersion !== 2 ||
        !experience.manifest.assets.includes(coverAssetId))
    )
      throw new AppError("COVER_NOT_DECLARED");
    if (coverAssetId && !this.store.get<Asset>("asset", coverAssetId)?.mime.startsWith("image/"))
      throw new AppError("COVER_NOT_IMAGE");
    if (experience.manifest.schemaVersion !== 2) return;
    for (const id of experience.manifest.assets) {
      const asset = this.store.get<Asset>("asset", id);
      if (!asset || (asset.ownerId !== actor.userId && asset.ownerId !== "shared"))
        throw new AppError("ASSET_NOT_ACCESSIBLE", 403);
    }
  }
  /** `remixOf` is the original post whose format this draft reuses; only the server passes it. */
  createDraft(actor: Actor, input: unknown, remixOf?: string) {
    const ownerId = this.actor(actor);
    const parsed = draftInputSchema.parse(input);
    this.checkAssets(actor, parsed.package, parsed.metadata.coverAssetId);
    parsed.package = normalizeFill(parsed.package);
    if (parsed.metadata.contributors.some((id) => !this.store.get("user", id)))
      throw new AppError("UNKNOWN_CONTRIBUTOR");
    const draft: DraftView = {
      id: randomUUID(),
      ownerId,
      ...parsed,
      revision: 1,
      updatedAt: new Date().toISOString(),
      ...(remixOf ? { remixOf } : {}),
    };
    this.store.transaction(() => this.store.put("draft", draft.id, draft));
    return draft;
  }
  draft(actor: Actor, id: string) {
    this.actor(actor);
    const d = this.store.get<DraftView>("draft", id);
    if (!d || d.ownerId !== actor.userId) throw new AppError("NOT_FOUND", 404);
    return d;
  }
  drafts(actor: Actor) {
    return this.store
      .all<DraftView>("draft")
      .filter((d) => d.ownerId === this.actor(actor))
      .reverse();
  }
  updateDraft(actor: Actor, id: string, input: unknown, revision: number) {
    const old = this.draft(actor, id);
    if (old.revision !== revision) throw new AppError("REVISION_CONFLICT", 409);
    const parsed = draftInputSchema.parse(input);
    this.checkAssets(actor, parsed.package, parsed.metadata.coverAssetId);
    parsed.package = normalizeFill(parsed.package);
    if (parsed.metadata.contributors.some((id) => !this.store.get("user", id)))
      throw new AppError("UNKNOWN_CONTRIBUTOR");
    const next = { ...old, ...parsed, revision: revision + 1, updatedAt: new Date().toISOString() };
    this.store.transaction(() => this.store.put("draft", id, next));
    return next;
  }
  publish(actor: Actor, id: string, revision: number, within?: (post: Publication) => void) {
    const draft = this.draft(actor, id);
    if (draft.revision !== revision) throw new AppError("REVISION_CONFLICT", 409);
    this.checkAssets(actor, draft.package, draft.metadata.coverAssetId);
    experienceSchema.parse(draft.package);
    this.publishGuard(actor.userId, draft);
    const published = this.store.all<Publication>("post").filter((p) => p.sourceDraftId === id);
    const existing = published.find((p) => p.revision === revision);
    if (existing) return existing;
    // Republishing a draft edits its post in place: same id, likes, comments and feed position.
    const earlier = published.at(-1);
    if (earlier) {
      this.editGuard(earlier);
      const edited: Publication = {
        ...earlier,
        package: draft.package,
        metadata: draft.metadata,
        revision: draft.revision,
        updatedAt: draft.updatedAt,
        digest: packageDigest(draft.package),
        editedAt: new Date().toISOString(),
      };
      const before = new Set(mentionedHandles(earlier.metadata.caption));
      this.store.transaction(() => {
        this.store.put("post", edited.id, edited);
        this.mention(edited, actor.userId, edited.metadata.caption, (h) => before.has(h));
      });
      return edited;
    }
    const post: Publication = {
      ...draft,
      id: randomUUID(),
      sourceDraftId: id,
      digest: packageDigest(draft.package),
      createdAt: new Date().toISOString(),
    };
    this.store.transaction(() => {
      this.store.put("post", post.id, post);
      within?.(post);
      this.mention(post, actor.userId, post.metadata.caption);
    });
    return post;
  }
  /** Notifies people named with @handle who can see the post. Runs inside the caller's transaction. */
  private mention(
    post: Publication,
    actorId: string,
    text: string,
    skip: (handle: string, userId: string) => boolean = () => false,
  ) {
    const users = this.users();
    for (const handle of mentionedHandles(text)) {
      const user = users.find((u) => u.handle === handle);
      if (!user || skip(handle, user.id) || !this.viewFilter(user.id, post)) continue;
      this.emit({ type: "mention", actorId, targetId: user.id, postId: post.id });
    }
  }
  /** The owner's own post, or NOT_FOUND/FORBIDDEN as a visitor would see it. */
  private ownPost(actor: Actor, id: string) {
    const me = this.actor(actor);
    const post = this.post(id);
    if (post.ownerId !== me) {
      this.visiblePost(actor, id);
      throw new AppError("FORBIDDEN", 403);
    }
    return post;
  }
  /** The draft that edits this post: its source draft, or a fresh one linked to it. */
  editPost(actor: Actor, id: string) {
    const post = this.ownPost(actor, id);
    this.editGuard(post);
    const source = this.store.get<DraftView>("draft", post.sourceDraftId);
    if (source && source.ownerId === post.ownerId) return source;
    const draft: DraftView = {
      id: randomUUID(),
      ownerId: post.ownerId,
      package: post.package,
      metadata: post.metadata,
      revision: post.revision,
      updatedAt: new Date().toISOString(),
      ...(post.remixOf ? { remixOf: post.remixOf } : {}),
    };
    this.store.transaction(() => {
      this.store.put("draft", draft.id, draft);
      this.store.put("post", post.id, { ...post, sourceDraftId: draft.id });
    });
    return draft;
  }
  /** Deletes the owner's post and everything people left on it. The draft stays in the studio. */
  deletePost(actor: Actor, id: string) {
    this.ownPost(actor, id);
    this.store.transaction(() => {
      this.store.remove("post", id);
      for (const kind of ["like", "save", "report", "progress", "vote"])
        for (const key of this.store.ids(kind))
          if (key.startsWith(`${id}:`)) this.store.remove(kind, key);
      for (const kind of ["comment", "contribution"])
        for (const note of this.store.all<Note>(kind))
          if (note.postId === id) this.store.remove(kind, note.id);
      for (const remove of this.postRemovers) remove(id);
    });
    return { deleted: true };
  }
  post(id: string) {
    const post = this.store.get<Publication>("post", id);
    if (!post) throw new AppError("NOT_FOUND", 404);
    return post;
  }
  /** A post as seen by this actor; hidden posts are indistinguishable from missing ones. */
  visiblePost(actor: Actor, id: string) {
    const post = this.post(id);
    if (!this.viewFilter(this.actor(actor), post)) throw new AppError("NOT_FOUND", 404);
    return post;
  }
  feed(actor: Actor): PostView[] {
    this.actor(actor);
    return this.views(
      actor,
      this.store
        .all<Publication>("post")
        .reverse()
        .filter((p) => this.viewFilter(actor.userId, p) && this.feedFilter(actor.userId, p)),
    );
  }
  /**
   * A format and every version of it the viewer can see, newest version first. Ignores the
   * active side: the page is about the format, not about where you are scrolling.
   */
  format(actor: Actor, id: string) {
    this.actor(actor);
    const root = this.store.get<Publication>("post", id);
    const rootId = root?.remixOf ?? id;
    const posts = this.store
      .all<Publication>("post")
      .reverse()
      .filter((p) => (p.id === rootId || p.remixOf === rootId) && this.viewFilter(actor.userId, p));
    if (!posts.length) throw new AppError("NOT_FOUND", 404);
    const views = this.views(actor, posts);
    return {
      rootId,
      root: views.find((p) => p.id === rootId) ?? null,
      versions: views.filter((p) => p.id !== rootId),
    };
  }
  private views(actor: Actor, posts: Publication[]): PostView[] {
    const users = this.users();
    // Versions of each format the viewer can see, oldest first, so a version's number never
    // depends on where it sits in a list.
    const versions = new Map<string, Publication[]>();
    for (const p of this.store.all<Publication>("post"))
      if (p.remixOf && this.viewFilter(actor.userId, p))
        versions.set(p.remixOf, [...(versions.get(p.remixOf) ?? []), p]);
    for (const list of versions.values())
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const remix = (p: Publication): PostView["remix"] => {
      if (!p.remixOf) return undefined;
      const list = versions.get(p.remixOf) ?? [];
      const root = this.store.get<Publication>("post", p.remixOf);
      const author =
        root && this.viewFilter(actor.userId, root) && users.find((u) => u.id === root.ownerId);
      return {
        rootId: p.remixOf,
        index: list.findIndex((v) => v.id === p.id) + 1,
        count: list.length,
        ...(root && author
          ? {
              root: {
                title: root.metadata.title,
                author: { name: author.name, handle: author.handle },
              },
            }
          : {}),
      };
    };
    return posts.map((p) => {
      const count = versions.get(p.id)?.length ?? 0;
      const r = remix(p);
      return {
        id: p.id,
        ownerId: p.ownerId,
        revision: p.revision,
        ...(p.editedAt ? { editedAt: p.editedAt } : {}),
        author: users.find((u) => u.id === p.ownerId)!,
        metadata: p.metadata,
        digest: p.digest,
        createdAt: p.createdAt,
        manifest: p.package.manifest,
        likes: this.store.all<{ postId: string }>("like").filter((l) => l.postId === p.id).length,
        liked: !!this.store.get("like", `${p.id}:${actor.userId}`),
        saved: !!this.store.get("save", `${p.id}:${actor.userId}`),
        comments: this.comments(p.id).length,
        ...(r ? { remix: r } : {}),
        ...(count ? { versions: count } : {}),
      };
    });
  }
  /**
   * Without a query: posts from people you don't follow yet, liveliest first (likes and comments,
   * fading over about a week). With one: every visible post whose title, caption or author
   * matches all of its words.
   */
  explore(actor: Actor, query?: unknown) {
    const me = this.actor(actor);
    const words = z
      .string()
      .trim()
      .toLowerCase()
      .max(60)
      .default("")
      .parse(query ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/^[@#]/, ""));
    const posts = this.feed(actor);
    if (words.length)
      return posts
        .filter((p) => {
          const text =
            `${p.metadata.title} ${p.metadata.caption} ${p.author.name} ${p.author.handle}`.toLowerCase();
          return words.every((w) => text.includes(w));
        })
        .slice(0, 60);
    const following = new Set(this.following(actor));
    const now = Date.now();
    const score = (p: PostView) =>
      (1 + p.likes + 2 * p.comments) /
      Math.pow(1 + (now - Date.parse(p.createdAt)) / 86_400_000 / 7, 1.5);
    return posts
      .filter((p) => p.ownerId !== me && !following.has(p.ownerId))
      .map((p) => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map(({ p }) => p);
  }
  toggle(actor: Actor, id: string, kind: "like" | "save") {
    const post = this.visiblePost(actor, id);
    const key = `${id}:${actor.userId}`;
    const exists = !!this.store.get(kind, key);
    this.store.transaction(() => {
      if (exists) this.store.remove(kind, key);
      else {
        this.store.put(kind, key, { postId: id, userId: actor.userId });
        if (kind === "like")
          this.emit({ type: "like", actorId: actor.userId, targetId: post.ownerId, postId: id });
      }
    });
    return { active: !exists };
  }
  follow(actor: Actor, userId: string) {
    this.actor(actor);
    if (userId === actor.userId || !this.store.get("user", userId))
      throw new AppError("INVALID_USER");
    const key = `${actor.userId}:${userId}`;
    const exists = !!this.store.get("follow", key);
    if (!exists) this.relationGuard(actor.userId, userId);
    if (!exists && this.needsRequest(actor.userId, userId)) {
      // Asking again withdraws the request, like tapping "Requested".
      const asked = !!this.store.get("follow-request", key);
      this.store.transaction(() => {
        if (asked) this.store.remove("follow-request", key);
        else {
          this.store.put("follow-request", key, {
            userId: actor.userId,
            target: userId,
            createdAt: new Date().toISOString(),
          });
          this.emit({ type: "follow-request", actorId: actor.userId, targetId: userId });
        }
      });
      return { active: false, requested: !asked };
    }
    this.store.transaction(() => {
      if (exists) this.store.remove("follow", key);
      else {
        this.store.put("follow", key, { userId: actor.userId, target: userId });
        this.emit({ type: "follow", actorId: actor.userId, targetId: userId });
      }
    });
    return { active: !exists };
  }
  following(actor: Actor) {
    return this.store
      .all<{ userId: string; target: string }>("follow")
      .filter((f) => f.userId === this.actor(actor))
      .map((f) => f.target);
  }
  comments(id: string) {
    this.post(id);
    return this.store.all<Note>("comment").filter((n) => n.postId === id);
  }
  comment(actor: Actor, id: string, text: unknown, parentId?: string) {
    const post = this.visiblePost(actor, id);
    let parent = parentId ? this.store.get<Note>("comment", parentId) : undefined;
    if (parentId && (!parent || parent.postId !== id)) throw new AppError("NOT_FOUND", 404);
    // Answering a reply joins the same thread rather than nesting deeper.
    if (parent?.parentId) parent = this.store.get<Note>("comment", parent.parentId) ?? parent;
    const note: Note = {
      id: randomUUID(),
      postId: id,
      userId: actor.userId,
      text: z.string().trim().min(1).max(1000).parse(text),
      createdAt: new Date().toISOString(),
      ...(parent ? { parentId: parent.id } : {}),
    };
    const replyTo = parentId ? this.store.get<Note>("comment", parentId)!.userId : undefined;
    this.store.transaction(() => {
      this.store.put("comment", note.id, note);
      if (replyTo !== post.ownerId)
        this.emit({ type: "comment", actorId: actor.userId, targetId: post.ownerId, postId: id });
      if (replyTo)
        this.emit({ type: "reply", actorId: actor.userId, targetId: replyTo, postId: id });
      // People already told about this comment are not told twice.
      this.mention(post, actor.userId, note.text, (_h, userId) =>
        [post.ownerId, replyTo].includes(userId),
      );
    });
    return note;
  }
  /** Authors delete their own comments; post owners delete any on their post. Replies go too. */
  deleteComment(actor: Actor, commentId: string) {
    const me = this.actor(actor);
    const note = this.store.get<Note>("comment", commentId);
    if (!note) throw new AppError("NOT_FOUND", 404);
    const post = this.visiblePost(actor, note.postId);
    if (note.userId !== me && post.ownerId !== me) throw new AppError("FORBIDDEN", 403);
    this.store.transaction(() => {
      this.store.remove("comment", note.id);
      for (const reply of this.store.all<Note>("comment"))
        if (reply.parentId === note.id) this.store.remove("comment", reply.id);
    });
    return { deleted: true };
  }
  report(actor: Actor, id: string, reason: unknown = "other") {
    this.visiblePost(actor, id);
    const parsed = reportReasonSchema.parse(reason ?? "other");
    this.store.transaction(() =>
      this.store.put("report", `${id}:${actor.userId}`, {
        postId: id,
        userId: actor.userId,
        reason: parsed,
        createdAt: new Date().toISOString(),
      }),
    );
    return { recorded: true };
  }
  upload(actor: Actor, input: unknown) {
    this.actor(actor);
    const parsed = z
      .object({
        name: z.string().min(1).max(120),
        mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
        base64: z
          .string()
          .max(4_000_000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      })
      .strict()
      .parse(input);
    const bytes = Buffer.from(parsed.base64, "base64");
    const valid =
      parsed.mime === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : parsed.mime === "image/png"
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid || bytes.length > 3_000_000) throw new AppError("INVALID_IMAGE");
    const asset: Asset = { id: randomUUID(), ownerId: actor.userId, ...parsed };
    this.store.transaction(() => this.store.put("asset", asset.id, asset));
    return { id: asset.id, name: asset.name, mime: asset.mime };
  }
  assets(actor: Actor) {
    this.actor(actor);
    return this.store
      .all<Asset>("asset")
      .filter((a) => a.ownerId === actor.userId || a.ownerId === "shared")
      .map(({ base64, ...a }) => a);
  }
  asset(actor: Actor, id: string) {
    this.actor(actor);
    const asset = this.store.get<Asset>("asset", id);
    const published = this.store
      .all<Publication>("post")
      .some(
        (p) =>
          p.package.manifest.schemaVersion === 2 &&
          p.package.manifest.assets.includes(id) &&
          this.viewFilter(actor.userId, p),
      );
    if (!asset || (asset.ownerId !== "shared" && asset.ownerId !== actor.userId && !published))
      throw new AppError("NOT_FOUND", 404);
    return asset;
  }
  capability(actor: Actor, postId: string, method: string, payload: unknown, preview = false) {
    this.actor(actor);
    const post = preview ? this.draft(actor, postId) : this.visiblePost(actor, postId);
    if (!(post.package.manifest.capabilities as string[]).includes(method))
      throw new AppError("CAPABILITY_DENIED", 403);
    if (preview) postId = `preview:${postId}:v${post.revision}`;
    const key = `${postId}:${actor.userId}`;
    if (method === "viewer.progress.read") return this.store.get("progress", key) ?? {};
    if (method === "viewer.progress.write") {
      const value = progressSchema.parse(payload);
      this.store.transaction(() => this.store.put("progress", key, value));
      return value;
    }
    if (method === "contributions.read")
      return this.store.all<Note>("contribution").filter((n) => n.postId === postId);
    if (method === "contributions.create") {
      if (actor.userId !== post.ownerId && !post.metadata.contributors.includes(actor.userId))
        throw new AppError("CONTRIBUTOR_REQUIRED", 403);
      const value = contributionSchema.parse(payload);
      if (value.assetId) this.asset(actor, value.assetId);
      const note: Note = {
        id: randomUUID(),
        postId,
        userId: actor.userId,
        ...value,
        createdAt: new Date().toISOString(),
      };
      this.store.transaction(() => this.store.put("contribution", note.id, note));
      return note;
    }
    if (method === "polls.read" || method === "polls.vote") {
      const manifest = post.package.manifest;
      if (manifest.schemaVersion !== 2 || !manifest.poll) throw new AppError("POLL_NOT_CONFIGURED");
      if (method === "polls.vote") {
        const value = z
          .object({
            option: z
              .number()
              .int()
              .min(0)
              .max(manifest.poll.options.length - 1),
          })
          .strict()
          .parse(payload);
        this.store.transaction(() =>
          this.store.put("vote", key, { postId, userId: actor.userId, option: value.option }),
        );
      }
      const votes = this.store
        .all<{ postId: string; option: number }>("vote")
        .filter((v) => v.postId === postId);
      return {
        ...manifest.poll,
        counts: manifest.poll.options.map((_, i) => votes.filter((v) => v.option === i).length),
        selected: this.store.get<{ option: number }>("vote", key)?.option ?? null,
      };
    }
    const handler = this.capabilityHandlers[method];
    if (handler) return handler(actor, preview ? "" : post.id, payload, preview);
    throw new AppError("METHOD_NOT_SUPPORTED");
  }
}
