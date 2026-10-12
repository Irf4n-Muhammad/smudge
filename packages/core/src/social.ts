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

export function packageDigest(value: Experience) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
/** Something one person did to another's account or post; used for notifications. */
export type SocialEvent =
  | { type: "follow"; actorId: string; targetId: string }
  | { type: "like" | "comment" | "reaction"; actorId: string; targetId: string; postId: string }
  | { type: "partner-request"; actorId: string; targetId: string };

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
    if (experience.manifest.schemaVersion !== 2) return;
    for (const id of experience.manifest.assets) {
      const asset = this.store.get<Asset>("asset", id);
      if (!asset || (asset.ownerId !== actor.userId && asset.ownerId !== "shared"))
        throw new AppError("ASSET_NOT_ACCESSIBLE", 403);
    }
  }
  createDraft(actor: Actor, input: unknown) {
    const ownerId = this.actor(actor);
    const parsed = draftInputSchema.parse(input);
    this.checkAssets(actor, parsed.package, parsed.metadata.coverAssetId);
    if (parsed.metadata.contributors.some((id) => !this.store.get("user", id)))
      throw new AppError("UNKNOWN_CONTRIBUTOR");
    const draft: DraftView = {
      id: randomUUID(),
      ownerId,
      ...parsed,
      revision: 1,
      updatedAt: new Date().toISOString(),
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
    const existing = this.store
      .all<Publication>("post")
      .find((p) => p.sourceDraftId === id && p.revision === revision);
    if (existing) return existing;
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
    });
    return post;
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
    const users = this.users();
    return this.store
      .all<Publication>("post")
      .reverse()
      .filter((p) => this.viewFilter(actor.userId, p))
      .map((p) => ({
        id: p.id,
        ownerId: p.ownerId,
        author: users.find((u) => u.id === p.ownerId)!,
        metadata: p.metadata,
        digest: p.digest,
        createdAt: p.createdAt,
        manifest: p.package.manifest,
        likes: this.store.all<{ postId: string }>("like").filter((l) => l.postId === p.id).length,
        liked: !!this.store.get("like", `${p.id}:${actor.userId}`),
        saved: !!this.store.get("save", `${p.id}:${actor.userId}`),
        comments: this.comments(p.id).length,
      }));
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
  comment(actor: Actor, id: string, text: unknown) {
    const post = this.visiblePost(actor, id);
    const note: Note = {
      id: randomUUID(),
      postId: id,
      userId: actor.userId,
      text: z.string().trim().min(1).max(1000).parse(text),
      createdAt: new Date().toISOString(),
    };
    this.store.transaction(() => {
      this.store.put("comment", note.id, note);
      this.emit({ type: "comment", actorId: actor.userId, targetId: post.ownerId, postId: id });
    });
    return note;
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
