import { randomUUID, createHash } from "node:crypto";
import {
  shareModSchema,
  installModSchema,
  type SharedMod,
  type ModSummary,
} from "../../contracts/src/mod.js";
import {
  profileIdentitySchema,
  profilePackageSchema,
  partSlots,
  type ProfileDraft,
  type ProfilePackage,
  type ProfilePublication,
} from "../../contracts/src/profile.js";
import { ProfileService } from "./profiles.js";
import { composeProfilePart } from "./composition.js";
import { AppError, type Asset } from "./social.js";
import type { Actor } from "./index.js";

/** Library records contain source and explicitly shared media, never profile identity or visitor state. */
export class ModService {
  constructor(readonly profiles: ProfileService) {}
  private get store() {
    return this.profiles.social.store;
  }
  get(id: string, version?: number): SharedMod {
    const value = version
      ? this.store.get<SharedMod>("mod-version", `${id}:${version}`)
      : this.store.get<SharedMod>("mod", id);
    if (!value) throw new AppError("NOT_FOUND", 404);
    return value;
  }
  list(actor: Actor): ModSummary[] {
    this.profiles.social.actor(actor);
    return this.store
      .all<SharedMod>("mod")
      .reverse()
      .map(({ package: pkg, ...m }) => ({
        ...m,
        creatorName: m.bundled
          ? "Forma starter"
          : (this.profiles.social.users().find((u) => u.id === m.creatorId)?.name ?? "Creator"),
        capabilities: pkg.manifest.capabilities,
        assetCount: pkg.manifest.assets.length,
      }));
  }
  asset(id: string, version: number, assetId: string) {
    const m = this.get(id, version);
    if (!m.package.manifest.assets.includes(assetId) && m.thumbnailAssetId !== assetId)
      throw new AppError("NOT_FOUND", 404);
    const a = this.store.get<Asset>("asset", assetId);
    if (!a || !["shared", `mod:${id}:${version}`].includes(a.ownerId))
      throw new AppError("NOT_FOUND", 404);
    return a;
  }
  private copy(
    pkg: ProfilePackage,
    ids: string[],
    allowed: string[],
    ownerId: string,
    reuse: Record<string, string> = {},
  ) {
    const mapping = new Map<string, string>(),
      assets: Asset[] = [];
    for (const id of new Set(ids)) {
      const a = this.store.get<Asset>("asset", id);
      if (!a || !allowed.includes(a.ownerId)) throw new AppError("ASSET_NOT_ACCESSIBLE", 403);
      if (a.ownerId === "shared") {
        mapping.set(id, id);
        continue;
      }
      const existing = reuse[id] ? this.store.get<Asset>("asset", reuse[id]!) : undefined;
      if (existing?.ownerId === ownerId) {
        mapping.set(id, existing.id);
        continue;
      }
      const next = { ...a, id: randomUUID(), ownerId };
      assets.push(next);
      mapping.set(id, next.id);
    }
    const next = structuredClone(pkg);
    next.manifest.assets = next.manifest.assets.map((id) => mapping.get(id)!);
    for (const [path, source] of Object.entries(next.files)) {
      let rewritten = source;
      for (const [old, id] of mapping) rewritten = rewritten.replaceAll(old, id);
      next.files[path] = rewritten;
    }
    return { package: profilePackageSchema.parse(next), assets, mapping };
  }
  share(actor: Actor, input: unknown): SharedMod {
    this.profiles.social.actor(actor);
    const value = shareModSchema.parse(input);
    const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const retryKey = `${actor.userId}:${value.submissionId}`;
    const retry = this.store.get<{ id: string; version: number; digest: string }>(
      "mod-submission",
      retryKey,
    );
    if (retry) {
      if (retry.digest !== digest) throw new AppError("SUBMISSION_CONFLICT", 409);
      return this.get(retry.id, retry.version);
    }
    const draft = this.profiles.draft(actor, value.draftId);
    if (draft.revision !== value.revision) throw new AppError("REVISION_CONFLICT", 409);
    if (draft.package.manifest.schemaVersion !== 2) throw new AppError("COMPOSITION_V2_REQUIRED");
    let pkg = structuredClone(draft.package);
    for (const slot of value.slots)
      if (!draft.package.manifest.parts[slot]) throw new AppError("PART_NOT_PROVIDED");
    for (const slot of partSlots)
      if (!value.slots.includes(slot)) pkg = composeProfilePart(pkg, null, slot);
    const previous = value.modId ? this.get(value.modId) : null;
    if (previous && previous.creatorId !== actor.userId) throw new AppError("NOT_FOUND", 404);
    if (previous?.bundled) throw new AppError("STARTER_READ_ONLY", 403);
    if (previous && previous.version !== value.expectedVersion)
      throw new AppError("MOD_CONFLICT", 409);
    const id = previous?.id ?? randomUUID(),
      version = (previous?.version ?? 0) + 1;
    const copied = this.copy(
      pkg,
      [...pkg.manifest.assets, ...(value.thumbnailAssetId ? [value.thumbnailAssetId] : [])],
      [actor.userId, "shared"],
      `mod:${id}:${version}`,
    );
    const mod: SharedMod = {
      id,
      version,
      creatorId: actor.userId,
      name: value.name,
      description: value.description,
      slots: value.slots,
      createdAt: new Date().toISOString(),
      package: copied.package,
      thumbnailAssetId: value.thumbnailAssetId ? copied.mapping.get(value.thumbnailAssetId)! : null,
    };
    this.store.transaction(() => {
      for (const a of copied.assets) this.store.put("asset", a.id, a);
      this.store.put("mod-version", `${id}:${version}`, mod);
      this.store.put("mod", id, mod);
      this.store.put("mod-submission", retryKey, { id, version, digest });
    });
    return mod;
  }
  install(actor: Actor, id: string, input: unknown, preview = false): ProfileDraft {
    this.profiles.social.actor(actor);
    const value = installModSchema.parse(input),
      mod = this.get(id, value.version);
    const old = value.draftId ? this.profiles.draft(actor, value.draftId) : null;
    if (old && old.revision !== value.revision) throw new AppError("REVISION_CONFLICT", 409);
    if (value.slot && !mod.slots.includes(value.slot)) throw new AppError("PART_NOT_PROVIDED");
    // Reuse the immutable edition's media in this draft so a second part has identical source paths.
    const previousInstall = old
      ? this.store
          .all<{
            modId: string;
            version: number;
            draftId: string;
            assetMap?: Record<string, string>;
          }>("mod-install")
          .reverse()
          .find((r) => r.modId === id && r.version === value.version && r.draftId === old.id)
      : undefined;
    const copied = this.copy(
      mod.package,
      mod.package.manifest.assets,
      ["shared", `mod:${id}:${value.version}`],
      actor.userId,
      previousInstall?.assetMap,
    );
    const pkg = old ? composeProfilePart(old.package, copied.package, value.slot!) : copied.package;
    const owner = this.profiles.social.users().find((u) => u.id === actor.userId)!;
    const draft: ProfileDraft = {
      ...(old ?? {
        id: randomUUID(),
        ownerId: actor.userId,
        identity: profileIdentitySchema.parse({
          name: owner.name,
          bio: owner.bio,
          avatarAssetId: owner.avatarAssetId ?? null,
        }),
      }),
      revision: (old?.revision ?? 0) + 1,
      ...(preview ? { id: randomUUID(), revision: 1 } : {}),
      origins: {
        ...(old?.origins ?? {}),
        ...Object.fromEntries(
          (value.slot ? [value.slot] : mod.slots).map((slot) => [
            slot,
            { modId: id, version: value.version, modified: false },
          ]),
        ),
      },
      package: profilePackageSchema.parse(pkg),
      updatedAt: new Date().toISOString(),
    };
    // Validate first, then commit the cloned media and draft together: failures cannot leave orphan assets.
    this.store.transaction(() => {
      for (const a of copied.assets) this.store.put("asset", a.id, a);
      this.store.put("profile-draft", draft.id, draft);
      if (preview)
        this.store.put("mod-preview", draft.id, {
          revision: draft.revision,
          targetId: old?.id ?? null,
          targetRevision: old?.revision ?? null,
        });
      this.store.put("mod-install", randomUUID(), {
        modId: id,
        version: value.version,
        draftId: draft.id,
        revision: draft.revision,
        slot: value.slot ?? null,
        assetMap: Object.fromEntries(copied.mapping),
      });
    });
    return draft;
  }
  applyPreview(actor: Actor, id: string) {
    const draft = this.profiles.draft(actor, id);
    const proposal = this.store.get<{
      revision: number;
      targetId: string | null;
      targetRevision: number | null;
      appliedRevision?: number;
    }>("mod-preview", id);
    if (!proposal || draft.revision !== proposal.revision) throw new AppError("PREVIEW_STALE", 409);
    if (!proposal.targetId) return draft;
    const old = this.profiles.draft(actor, proposal.targetId);
    if (proposal.appliedRevision === old.revision) return old;
    if (old.revision !== proposal.targetRevision) throw new AppError("REVISION_CONFLICT", 409);
    const next = {
      ...draft,
      id: old.id,
      revision: old.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.store.transaction(() => {
      this.store.put("profile-draft", next.id, next);
      this.store.put("mod-preview", id, { ...proposal, appliedRevision: next.revision });
      // Keep the media mapping when a later part from the same edition is mixed again.
      for (const record of this.store
        .all<{ draftId: string; [key: string]: unknown }>("mod-install")
        .filter((r) => r.draftId === id))
        this.store.put("mod-install", randomUUID(), {
          ...record,
          draftId: next.id,
          revision: next.revision,
        });
    });
    return next;
  }
  combination(actor: Actor, ownerId: string, publicationId: string) {
    this.profiles.social.actor(actor);
    if (this.profiles.state(ownerId).publicationId !== publicationId)
      throw new AppError("PROFILE_CONFLICT", 409);
    const pub = this.profiles.publication(publicationId);
    const copied = this.copy(
      pub.package,
      pub.package.manifest.assets,
      [ownerId, "shared"],
      actor.userId,
    );
    const owner = this.profiles.social.users().find((u) => u.id === actor.userId)!;
    const draft: ProfileDraft = {
      id: randomUUID(),
      ownerId: actor.userId,
      revision: 1,
      package: copied.package,
      identity: { name: owner.name, bio: owner.bio, avatarAssetId: owner.avatarAssetId ?? null },
      origins: structuredClone(pub.origins ?? {}),
      updatedAt: new Date().toISOString(),
    };
    this.store.transaction(() => {
      for (const asset of copied.assets) this.store.put("asset", asset.id, asset);
      this.store.put("profile-draft", draft.id, draft);
      this.store.put("mod-preview", draft.id, {
        revision: 1,
        targetId: null,
        targetRevision: null,
      });
    });
    return draft;
  }
  credits(ownerId: string) {
    const state = this.profiles.state(ownerId);
    const pub = state.publicationId ? this.profiles.publication(state.publicationId) : null;
    return {
      publicationId: state.publicationId,
      parts: partSlots.map((slot) => {
        const part =
          pub?.package.manifest.schemaVersion === 2 ? pub.package.manifest.parts[slot] : null;
        const origin = pub?.origins?.[slot];
        const mod = origin ? this.get(origin.modId, origin.version) : null;
        return {
          slot,
          present: Boolean(part),
          name: part?.name ?? null,
          origin:
            origin && mod
              ? {
                  ...origin,
                  name: mod.name,
                  creatorId: mod.bundled ? "forma" : mod.creatorId,
                  creatorName: mod.bundled
                    ? "Forma starter"
                    : (this.profiles.social.users().find((u) => u.id === mod.creatorId)?.name ??
                      "Creator"),
                }
              : null,
        };
      }),
    };
  }
  creator(actor: Actor, id: string) {
    this.profiles.social.actor(actor);
    const user = this.profiles.social.users().find((u) => u.id === id);
    if (!user && id !== "forma") throw new AppError("NOT_FOUND", 404);
    const mods = this.list(actor).filter((m) =>
      id === "forma" ? m.bundled : !m.bundled && m.creatorId === id,
    );
    const active = this.profiles.social
      .users()
      .map((u) => this.profiles.state(u.id).publicationId)
      .filter(Boolean)
      .map((p) => this.profiles.publication(p!));
    const uses = (pub: ProfilePublication, modId: string) =>
      Object.values(pub.origins ?? {}).some((o) => o?.modId === modId);
    return {
      id,
      name: user?.name ?? "Forma starter",
      bio: user?.bio ?? "Built-in starting points for your own worlds.",
      handle: user?.handle ?? null,
      profileCount: active.filter((p) => mods.some((m) => uses(p, m.id))).length,
      mods: mods.map((m) => ({ ...m, profileCount: active.filter((p) => uses(p, m.id)).length })),
    };
  }
  seed(id: string, name: string, description: string, input: unknown) {
    const pkg = profilePackageSchema.parse(input);
    if (pkg.manifest.schemaVersion !== 2) throw new AppError("COMPOSITION_V2_REQUIRED");
    for (const assetId of pkg.manifest.assets)
      if (this.store.get<Asset>("asset", assetId)?.ownerId !== "shared")
        throw new AppError("ASSET_NOT_ACCESSIBLE", 403);
    const old = this.store.get<SharedMod>("mod", id);
    if (old && (!old.bundled || JSON.stringify(old.package) === JSON.stringify(pkg))) return;
    const mod: SharedMod = {
      id,
      version: (old?.version ?? 0) + 1,
      creatorId: "raka",
      name,
      description,
      slots: partSlots.filter((s) => pkg.manifest.schemaVersion === 2 && pkg.manifest.parts[s]),
      createdAt: new Date().toISOString(),
      package: pkg,
      thumbnailAssetId: null,
      bundled: true,
    };
    this.store.transaction(() => {
      this.store.put("mod", id, mod);
      this.store.put("mod-version", `${id}:${mod.version}`, mod);
    });
  }
}
