import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  profilePackageSchema,
  profileIdentitySchema,
  relaySubmissionSchema,
  wallNoteSubmissionSchema,
  wallReportSchema,
  type RelayContribution,
  type WallNote,
  type ProfileDraft,
  type ProfilePublication,
  type ProfileState,
  type ProfilePackage,
  type ProfileIdentity,
} from "../../contracts/src/profile.js";
import { SocialService, AppError, type Asset } from "./social.js";
import type { Actor } from "./index.js";

export class ProfileService {
  constructor(public readonly social: SocialService) {}
  private identity(actor: Actor, input: unknown): ProfileIdentity {
    const value = profileIdentitySchema.parse(input);
    if (value.avatarAssetId) {
      const asset = this.social.store.get<Asset>("asset", value.avatarAssetId);
      if (!asset || ![actor.userId, "shared"].includes(asset.ownerId))
        throw new AppError("ASSET_NOT_ACCESSIBLE", 403);
    }
    return value;
  }
  private applyIdentity(ownerId: string, identity: ProfileIdentity) {
    const owner = this.social.users().find((u) => u.id === ownerId)!;
    const next = {
      ...owner,
      name: identity.name,
      bio: identity.bio,
      initials: identity.name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase(),
    };
    if (identity.avatarAssetId) next.avatarAssetId = identity.avatarAssetId;
    else delete next.avatarAssetId;
    this.social.store.put("user", ownerId, next);
  }
  /** Name, bio and photo changed outside the profile designer, from onboarding or settings. */
  updateIdentity(actor: Actor, input: unknown) {
    const ownerId = this.social.actor(actor);
    const identity = this.identity(actor, input);
    this.social.store.transaction(() => this.applyIdentity(ownerId, identity));
    return identity;
  }
  publicAvatar(ownerId: string) {
    const owner = this.social.users().find((u) => u.id === ownerId);
    if (!owner?.avatarAssetId) throw new AppError("NOT_FOUND", 404);
    return this.social.asset({ userId: ownerId }, owner.avatarAssetId);
  }
  private assets(actor: Actor, pkg: ProfilePackage) {
    for (const id of pkg.manifest.assets) {
      const a = this.social.store.get<Asset>("asset", id);
      if (!a || ![actor.userId, "shared"].includes(a.ownerId))
        throw new AppError("ASSET_NOT_ACCESSIBLE", 403);
    }
  }
  state(ownerId: string): ProfileState {
    if (!this.social.users().some((u) => u.id === ownerId)) throw new AppError("NOT_FOUND", 404);
    return (
      this.social.store.get<ProfileState>("profile-state", ownerId) ?? {
        ownerId,
        version: 0,
        publicationId: null,
      }
    );
  }
  public(ownerId: string) {
    const state = this.state(ownerId);
    const pub = state.publicationId ? this.publication(state.publicationId) : null;
    return { ...state, manifest: pub?.package.manifest ?? null };
  }
  data(actor: Actor, ownerId: string, identity?: ProfileIdentity) {
    this.social.actor(actor);
    this.state(ownerId);
    const stored = this.social.users().find((u) => u.id === ownerId)!;
    const owner = identity
      ? {
          ...stored,
          name: identity.name,
          bio: identity.bio,
          initials: identity.name
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0])
            .join("")
            .toUpperCase(),
          avatarAssetId: identity.avatarAssetId ?? undefined,
        }
      : stored;
    const avatar = owner.avatarAssetId
      ? this.social.asset({ userId: ownerId }, owner.avatarAssetId)
      : null;
    return {
      owner: {
        ...owner,
        ...(avatar ? { avatarSrc: `data:${avatar.mime};base64,${avatar.base64}` } : {}),
      },
      posts: this.social
        .feed(actor)
        .filter((p) => p.ownerId === ownerId)
        .map((p) => ({
          id: p.id,
          title: p.metadata.title,
          caption: p.metadata.caption,
          format: p.metadata.format,
          hasCover: Boolean(p.metadata.coverAssetId),
        })),
    };
  }
  create(actor: Actor, input: unknown) {
    this.social.actor(actor);
    const pkg = profilePackageSchema.parse(input);
    this.assets(actor, pkg);
    const d: ProfileDraft = {
      id: randomUUID(),
      ownerId: actor.userId,
      revision: 1,
      package: pkg,
      updatedAt: new Date().toISOString(),
      identity: this.identity(
        actor,
        (() => {
          const owner = this.social.users().find((u) => u.id === actor.userId)!;
          return { name: owner.name, bio: owner.bio, avatarAssetId: owner.avatarAssetId ?? null };
        })(),
      ),
    };
    this.social.store.transaction(() => this.social.store.put("profile-draft", d.id, d));
    return d;
  }
  draft(actor: Actor, id: string) {
    this.social.actor(actor);
    const d = this.social.store.get<ProfileDraft>("profile-draft", id);
    if (!d || d.ownerId !== actor.userId) throw new AppError("NOT_FOUND", 404);
    return d;
  }
  drafts(actor: Actor) {
    this.social.actor(actor);
    return this.social.store
      .all<ProfileDraft>("profile-draft")
      .filter((d) => d.ownerId === actor.userId)
      .reverse();
  }
  update(actor: Actor, id: string, input: unknown, revision: number, identity?: unknown) {
    const old = this.draft(actor, id);
    if (old.revision !== revision) throw new AppError("REVISION_CONFLICT", 409);
    const pkg = profilePackageSchema.parse(input);
    this.assets(actor, pkg);
    const d = {
      ...old,
      package: pkg,
      origins: this.updatedOrigins(old, pkg),
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
      ...(identity === undefined ? {} : { identity: this.identity(actor, identity) }),
    };
    this.social.store.transaction(() => this.social.store.put("profile-draft", id, d));
    return d;
  }
  private updatedOrigins(
    old: ProfileDraft,
    pkg: ProfilePackage,
  ): NonNullable<ProfileDraft["origins"]> {
    const origins: NonNullable<ProfileDraft["origins"]> = {};
    if (old.package.manifest.schemaVersion !== 2 || pkg.manifest.schemaVersion !== 2)
      return origins;
    for (const slot of ["profile", "post", "story", "feature"] as const) {
      const origin = old.origins?.[slot];
      if (
        origin &&
        JSON.stringify(old.package.manifest.parts[slot]) ===
          JSON.stringify(pkg.manifest.parts[slot]) &&
        pkg.manifest.parts[slot]
      )
        origins[slot] = {
          ...origin,
          modified: origin.modified || JSON.stringify(old.package) !== JSON.stringify(pkg),
        };
    }
    return origins;
  }
  publication(id: string) {
    const p = this.social.store.get<ProfilePublication>("profile-publication", id);
    if (!p) throw new AppError("NOT_FOUND", 404);
    return p;
  }
  history(actor: Actor) {
    this.social.actor(actor);
    return this.social.store
      .all<ProfilePublication>("profile-publication")
      .filter((p) => p.ownerId === actor.userId)
      .reverse();
  }
  publish(actor: Actor, id: string, revision: number, expectedVersion: number) {
    const draft = this.draft(actor, id);
    if (draft.revision !== revision) throw new AppError("REVISION_CONFLICT", 409);
    this.assets(actor, draft.package);
    profilePackageSchema.parse(draft.package);
    if (draft.identity) this.identity(actor, draft.identity);
    const existing = this.history(actor).find(
      (p) => p.sourceDraftId === id && p.revision === revision,
    );
    const state = this.state(actor.userId);
    if (existing && state.publicationId === existing.id && state.version === expectedVersion + 1)
      return state;
    if (state.version !== expectedVersion) throw new AppError("PROFILE_CONFLICT", 409);
    const pub: ProfilePublication = existing ?? {
      ...draft,
      id: randomUUID(),
      sourceDraftId: id,
      createdAt: new Date().toISOString(),
    };
    const next = { ownerId: actor.userId, version: state.version + 1, publicationId: pub.id };
    this.social.store.transaction(() => {
      this.social.store.put("profile-publication", pub.id, pub);
      this.social.store.put("profile-state", actor.userId, next);
      if (pub.identity) this.applyIdentity(actor.userId, pub.identity);
    });
    return next;
  }
  restore(actor: Actor, publicationId: string | null, expectedVersion: number) {
    this.social.actor(actor);
    const state = this.state(actor.userId);
    if (state.version !== expectedVersion) throw new AppError("PROFILE_CONFLICT", 409);
    let identity: ProfileIdentity | undefined;
    if (publicationId) {
      const p = this.publication(publicationId);
      if (p.ownerId !== actor.userId) throw new AppError("NOT_FOUND", 404);
      this.assets(actor, p.package);
      if (p.identity) identity = this.identity(actor, p.identity);
    }
    const next = { ownerId: actor.userId, version: state.version + 1, publicationId };
    this.social.store.transaction(() => {
      this.social.store.put("profile-state", actor.userId, next);
      if (identity) this.applyIdentity(actor.userId, identity);
    });
    return next;
  }
  capability(actor: Actor, id: string, preview: boolean, method: string, payload: unknown) {
    this.social.actor(actor);
    const item = preview ? this.draft(actor, id) : this.publication(id);
    // Reporting a wall note rides on the read grant (see the Wall below).
    const declared = method === "profile.wall.report" ? "profile.wall.read" : method;
    if (!(item.package.manifest.capabilities as string[]).includes(declared))
      throw new AppError("CAPABILITY_DENIED", 403);
    if (method === "profile.poll.read" || method === "profile.poll.vote") {
      const poll =
        item.package.manifest.schemaVersion === 2 ? item.package.manifest.poll : undefined;
      if (!poll) throw new AppError("CAPABILITY_DENIED", 403);
      const signature = createHash("sha256").update(JSON.stringify(poll)).digest("hex");
      if (!preview) {
        const activeId = this.state(item.ownerId).publicationId;
        const manifest = activeId ? this.publication(activeId).package.manifest : null;
        if (
          !manifest ||
          manifest.schemaVersion !== 2 ||
          !manifest.capabilities.includes(method) ||
          JSON.stringify(manifest.poll) !== JSON.stringify(poll)
        )
          throw new AppError("CAPABILITY_DENIED", 403);
      }
      const key = preview ? `preview:${id}:${item.revision}` : `owner:${item.ownerId}:${signature}`;
      const votes = this.social.store.get<Record<string, string>>("profile-poll", key) ?? {};
      if (method === "profile.poll.vote") {
        const { option } = z
          .object({ option: z.string().max(40) })
          .strict()
          .parse(payload);
        if (!poll.options.some((o) => o.id === option)) throw new AppError("INVALID_OPTION");
        if (!Object.hasOwn(votes, actor.userId) && Object.keys(votes).length >= 10000)
          throw new AppError("POLL_FULL", 409);
        const next = { ...votes, [actor.userId]: option };
        this.social.store.transaction(() => this.social.store.put("profile-poll", key, next));
        Object.assign(votes, next);
      } else z.undefined().parse(payload);
      return {
        question: poll.question,
        options: poll.options.map((o) => ({
          ...o,
          votes: Object.values(votes).filter((v) => v === o.id).length,
        })),
        selected: votes[actor.userId] ?? null,
        total: Object.keys(votes).length,
        preview,
      };
    }
    if (method === "profile.social.read" || method === "profile.social.toggle") {
      if (method === "profile.social.read") z.undefined().parse(payload);
      if (!preview) {
        const active = this.state(item.ownerId).publicationId;
        if (
          !active ||
          !(this.publication(active).package.manifest.capabilities as string[]).includes(method)
        )
          throw new AppError("CAPABILITY_DENIED", 403);
      }
      if (method === "profile.social.toggle") {
        // Preview cannot mutate real social state. Actor and owner always come from the ticket.
        if (preview) throw new AppError("PREVIEW_READ_ONLY", 403);
        const input = z
          .discriminatedUnion("action", [
            z.object({ action: z.literal("follow") }).strict(),
            z.object({ action: z.enum(["like", "save"]), postId: z.string().uuid() }).strict(),
          ])
          .parse(payload);
        if (input.action === "follow") this.social.follow(actor, item.ownerId);
        else {
          if (this.social.post(input.postId).ownerId !== item.ownerId)
            throw new AppError("NOT_FOUND", 404);
          this.social.toggle(actor, input.postId, input.action);
        }
      }
      return {
        writable: !preview,
        ownProfile: actor.userId === item.ownerId,
        following: this.social.following(actor).includes(item.ownerId),
        // A private owner's follow button reads "Requested" while the request waits.
        requested: !!this.social.store.get("follow-request", `${actor.userId}:${item.ownerId}`),
        followers: this.social.store
          .all<{ target: string }>("follow")
          .filter((f) => f.target === item.ownerId).length,
        posts: this.social
          .feed(actor)
          .filter((p) => p.ownerId === item.ownerId)
          .map((p) => ({
            id: p.id,
            likes: p.likes,
            liked: p.liked,
            saved: p.saved,
            comments: p.comments,
          })),
      };
    }
    if (method === "relay.read" || method === "relay.add") {
      // A historical publication must not bypass the owner's current decision to disable a mod.
      if (!preview) {
        const active = this.state(item.ownerId).publicationId;
        if (
          !active ||
          !(this.publication(active).package.manifest.capabilities as string[]).includes(method)
        )
          throw new AppError("CAPABILITY_DENIED", 403);
      }
      const key = preview ? `preview:${id}:${item.revision}` : `owner:${item.ownerId}`;
      const entries = this.social.store.get<RelayContribution[]>("profile-relay", key) ?? [];
      if (method === "relay.read") return entries;
      const input = relaySubmissionSchema.parse(payload);
      const existing = entries.find((e) => e.id === input.submissionId);
      if (existing) {
        if (existing.userId !== actor.userId) throw new AppError("SUBMISSION_CONFLICT", 409);
        return existing;
      }
      if (entries.length >= 200) throw new AppError("RELAY_FULL", 409);
      const entry: RelayContribution = {
        id: input.submissionId,
        userId: actor.userId,
        name: this.social.users().find((u) => u.id === actor.userId)!.name,
        createdAt: new Date().toISOString(),
        strokes: input.strokes,
      };
      this.social.store.transaction(() =>
        this.social.store.put("profile-relay", key, [...entries, entry]),
      );
      return entry;
    }
    if (method.startsWith("profile.wall.")) {
      // Same rule as the relay: the owner's current publication decides whether the Wall is on.
      // Reporting rides on the read grant, so a wall people can see can always be flagged.
      const grant = method === "profile.wall.report" ? "profile.wall.read" : method;
      if (!preview) {
        const active = this.state(item.ownerId).publicationId;
        if (
          !active ||
          !(this.publication(active).package.manifest.capabilities as string[]).includes(grant)
        )
          throw new AppError("CAPABILITY_DENIED", 403);
      }
      // A draft gets its own wall, so trying it out never writes on the live one.
      const key = preview ? `preview:${id}` : `owner:${item.ownerId}`;
      const notes = this.social.store.get<WallNote[]>("profile-wall", key) ?? [];
      const reported = (n: WallNote) =>
        !preview &&
        Boolean(this.social.store.get("wall-report", `${item.ownerId}:${n.id}:${actor.userId}`));
      // A note someone reported disappears for them straight away; moderators decide the rest.
      const view = (list: WallNote[]) => ({
        notes: list
          .filter((n) => !reported(n))
          .slice(-60)
          .reverse()
          .map((n) => ({
            ...n,
            removable: n.userId === actor.userId || item.ownerId === actor.userId,
            reportable: !preview && n.userId !== actor.userId,
          })),
        total: list.length,
      });
      if (method === "profile.wall.read") {
        z.undefined().parse(payload);
        return view(notes);
      }
      if (method === "profile.wall.remove") {
        const { noteId } = z.object({ noteId: z.string().uuid() }).strict().parse(payload);
        const note = notes.find((n) => n.id === noteId);
        if (!note) throw new AppError("NOT_FOUND", 404);
        // Authors can take their note back; owners can clear anything off their own wall.
        if (note.userId !== actor.userId && item.ownerId !== actor.userId)
          throw new AppError("FORBIDDEN", 403);
        const next = notes.filter((n) => n.id !== noteId);
        this.social.store.transaction(() => this.social.store.put("profile-wall", key, next));
        return view(next);
      }
      if (method === "profile.wall.report") {
        const { noteId, reason } = wallReportSchema.parse(payload);
        const note = notes.find((n) => n.id === noteId);
        if (preview || !note) throw new AppError("NOT_FOUND", 404);
        if (note.userId === actor.userId) throw new AppError("CANNOT_REPORT_OWN_NOTE");
        this.social.store.transaction(() =>
          this.social.store.put("wall-report", `${item.ownerId}:${noteId}:${actor.userId}`, {
            ownerId: item.ownerId,
            noteId,
            reporterId: actor.userId,
            reason,
            createdAt: new Date().toISOString(),
          }),
        );
        return view(notes);
      }
      const input = wallNoteSubmissionSchema.parse(payload);
      const existing = notes.find((n) => n.id === input.submissionId);
      if (existing) {
        if (existing.userId !== actor.userId) throw new AppError("SUBMISSION_CONFLICT", 409);
        return view(notes);
      }
      // Blocked people (either way) and suspended accounts can't write on someone's wall.
      if (actor.userId !== item.ownerId) this.social.relationGuard(actor.userId, item.ownerId);
      if (notes.length >= 200) throw new AppError("WALL_FULL", 409);
      if (notes.filter((n) => n.userId === actor.userId).length >= 5)
        throw new AppError("WALL_NOTE_LIMIT", 409);
      const note: WallNote = {
        id: input.submissionId,
        userId: actor.userId,
        name: this.social.users().find((u) => u.id === actor.userId)!.name,
        text: input.text,
        tone: input.tone,
        createdAt: new Date().toISOString(),
      };
      const next = [...notes, note];
      this.social.store.transaction(() => this.social.store.put("profile-wall", key, next));
      return view(next);
    }
    if (method === "profile.cover") {
      const { postId } = z.object({ postId: z.string().uuid() }).strict().parse(payload);
      if (!preview) {
        const active = this.state(item.ownerId).publicationId;
        if (
          !active ||
          !(this.publication(active).package.manifest.capabilities as string[]).includes(method)
        )
          throw new AppError("CAPABILITY_DENIED", 403);
      }
      // Never accept arbitrary asset IDs: only the declared cover of this owner's public post.
      const post = this.social.post(postId);
      if (post.ownerId !== item.ownerId) throw new AppError("NOT_FOUND", 404);
      const cover = post.metadata.coverAssetId;
      if (!cover) return null;
      if (
        post.package.manifest.schemaVersion !== 2 ||
        !post.package.manifest.assets.includes(cover)
      )
        throw new AppError("COVER_NOT_DECLARED");
      const asset = this.social.asset(actor, cover);
      return { src: `data:${asset.mime};base64,${asset.base64}`, alt: post.metadata.title };
    }
    if (method === "profile.read")
      return this.data(actor, item.ownerId, preview ? item.identity : undefined);
    if (method === "profile.openPost") {
      const { postId } = z.object({ postId: z.string().uuid() }).strict().parse(payload);
      const post = this.social.post(postId);
      if (post.ownerId !== item.ownerId) throw new AppError("NOT_FOUND", 404);
      return { postId };
    }
    throw new AppError("METHOD_NOT_SUPPORTED");
  }
  report(actor: Actor, ownerId: string) {
    this.social.actor(actor);
    const state = this.state(ownerId);
    this.social.store.transaction(() =>
      this.social.store.put("profile-report", `${ownerId}:${actor.userId}`, {
        ownerId,
        reporterId: actor.userId,
        publicationId: state.publicationId,
        createdAt: new Date().toISOString(),
      }),
    );
    return { recorded: true };
  }
}
