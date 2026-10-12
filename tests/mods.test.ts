import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService, type Asset } from "../packages/core/src/social.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import { ModService } from "../packages/core/src/mods.js";
import { composeProfilePart } from "../packages/core/src/composition.js";
import { profilePackageSchema } from "../packages/contracts/src/profile.js";
import { musicPackage } from "../apps/server/music.js";

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "forma-mods-")),
    path = join(dir, "db.sqlite");
  const store = await Store.open(path);
  store.transaction(() => {
    for (const id of ["alice", "bob", "carol"])
      store.put("user", id, {
        id,
        name: id,
        handle: id,
        bio: "Own bio",
        initials: id[0],
        color: "#111111",
      });
  });
  const profiles = new ProfileService(new SocialService(store));
  const pkg = structuredClone(musicPackage);
  pkg.manifest.assets = [];
  return { dir, path, store, profiles, mods: new ModService(profiles), pkg };
}
test("discovery tracks pinned public usage and reusable combinations while previews preserve drafts", async () => {
  const { dir, store, profiles, mods, pkg } = await fixture();
  try {
    const alice = { userId: "alice" },
      bob = { userId: "bob" },
      carol = { userId: "carol" };
    const asset = randomUUID();
    store.transaction(() =>
      store.put("asset", asset, {
        id: asset,
        ownerId: "alice",
        name: "Design",
        mime: "image/png",
        base64: "aGVsbG8=",
      }),
    );
    pkg.manifest.assets = [asset];
    pkg.files["design.html"] = `<img src="asset:${asset}">`;
    const source = profiles.create(alice, pkg);
    const share = {
      submissionId: randomUUID(),
      draftId: source.id,
      revision: 1,
      name: "Original",
      description: "Artist's design",
      slots: ["profile", "post", "story", "feature"],
      shareAssets: true,
    };
    const mod = mods.share(alice, share);
    const installed = mods.install(bob, mod.id, { version: 1 });
    const preview = mods.install(
      bob,
      mod.id,
      { version: 1, draftId: installed.id, revision: 1, slot: "post" },
      true,
    );
    assert.notEqual(preview.id, installed.id);
    assert.equal(profiles.draft(bob, installed.id).revision, 1);
    assert.equal(mods.creator(carol, "alice").profileCount, 0);
    assert.throws(() => mods.applyPreview(carol, preview.id), { code: "NOT_FOUND" });
    const applied = mods.applyPreview(bob, preview.id);
    assert.deepEqual(mods.applyPreview(bob, preview.id), applied);
    const live = profiles.publish(bob, applied.id, applied.revision, 0);
    assert.equal(mods.creator(carol, "alice").profileCount, 1);
    assert.equal(mods.creator(carol, "alice").mods[0]!.profileCount, 1);
    assert.equal(mods.credits("bob").parts[0]!.origin?.version, 1);
    const identity = profiles.update(bob, applied.id, applied.package, applied.revision, {
      name: "Bob renamed",
      bio: "Mine",
      avatarAssetId: null,
    });
    assert.equal(identity.origins?.profile?.modified, false);
    const edited = profiles.update(
      bob,
      applied.id,
      { ...identity.package, files: { ...identity.package.files, "extra.css": "body{color:red}" } },
      identity.revision,
    );
    assert.equal(edited.origins?.profile?.modified, true);
    const newer = profiles.publish(bob, edited.id, edited.revision, live.version);
    mods.share(alice, {
      ...share,
      submissionId: randomUUID(),
      modId: mod.id,
      expectedVersion: 1,
      name: "Latest",
    });
    assert.equal(mods.credits("bob").parts[0]!.origin?.name, "Original");
    assert.throws(() => mods.combination(carol, "bob", live.publicationId!), {
      code: "PROFILE_CONFLICT",
    });
    const copy = mods.combination(carol, "bob", newer.publicationId!);
    assert.equal(copy.identity?.name, "carol");
    assert.equal(copy.package.files["extra.css"], "body{color:red}");
    assert.equal(copy.origins?.post?.modId, mod.id);
    assert.notEqual(copy.package.manifest.assets[0], edited.package.manifest.assets[0]);
    assert.equal(store.get<Asset>("asset", copy.package.manifest.assets[0]!)?.ownerId, "carol");
    assert.equal(mods.creator(carol, "alice").profileCount, 1);
    const cp = profiles.publish(carol, mods.applyPreview(carol, copy.id).id, 1, 0);
    assert.equal(mods.creator(carol, "alice").profileCount, 2);
    profiles.restore(carol, null, cp.version);
    assert.equal(mods.creator(carol, "alice").profileCount, 1);
    const stale = mods.install(
      bob,
      mod.id,
      { version: 1, draftId: edited.id, revision: edited.revision, slot: "post" },
      true,
    );
    profiles.update(bob, edited.id, edited.package, edited.revision);
    assert.throws(() => mods.applyPreview(bob, stale.id), { code: "REVISION_CONFLICT" });
    const changedPreview = mods.install(carol, mod.id, { version: 1 }, true);
    profiles.update(carol, changedPreview.id, changedPreview.package, 1);
    assert.throws(() => mods.applyPreview(carol, changedPreview.id), { code: "PREVIEW_STALE" });
    const removed = profiles.update(
      bob,
      edited.id,
      composeProfilePart(edited.package, null, "feature"),
      edited.revision + 1,
    );
    assert.equal(removed.origins?.feature, undefined);
    assert.throws(() => profiles.create(alice, { ...pkg, origins: installed.origins }));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("shared mod versions clone only declared assets, preserve installer identity, reject forgery and keep installs pinned", async () => {
  const { dir, path, store, profiles, mods, pkg } = await fixture();
  try {
    const alice = { userId: "alice" },
      bob = { userId: "bob" };
    const own = randomUUID(),
      foreign = randomUUID(),
      secret = randomUUID();
    store.transaction(() => {
      for (const [id, ownerId] of [
        [own, "alice"],
        [foreign, "bob"],
        [secret, "alice"],
      ])
        store.put("asset", id!, {
          id,
          ownerId,
          name: "Synthetic image",
          mime: "image/png",
          base64: "aGVsbG8=",
        });
    });
    pkg.manifest.assets = [own];
    pkg.files["owned.html"] = `<img src="asset:${own}">`;
    const draft = profiles.create(alice, pkg);
    const input = {
      submissionId: randomUUID(),
      draftId: draft.id,
      revision: 1,
      name: "Alice's zine",
      description: "A reusable design",
      slots: ["profile", "post", "story", "feature"],
      shareAssets: true,
      thumbnailAssetId: own,
    };
    assert.throws(() => mods.share(bob, input), { code: "NOT_FOUND" });
    assert.throws(() => mods.share(alice, { ...input, creatorId: "bob" }));
    assert.throws(() => mods.share(alice, { ...input, shareAssets: false }));
    assert.throws(() => mods.share(alice, { ...input, thumbnailAssetId: foreign }), {
      code: "ASSET_NOT_ACCESSIBLE",
    });
    const mod = mods.share(alice, input);
    assert.deepEqual(mods.share(alice, input), mod);
    assert.throws(() => mods.share(alice, { ...input, name: "Different" }), {
      code: "SUBMISSION_CONFLICT",
    });
    assert.equal((mod as any).identity, undefined);
    assert.notEqual(mod.package.manifest.assets[0], own);
    assert.equal(mods.asset(mod.id, 1, mod.package.manifest.assets[0]!).base64, "aGVsbG8=");
    assert.throws(() => mods.asset(mod.id, 1, secret), { code: "NOT_FOUND" });
    assert.throws(() => mods.asset(mod.id, 1, own), { code: "NOT_FOUND" });
    const installed = mods.install(bob, mod.id, { version: 1 });
    assert.equal(installed.ownerId, "bob");
    assert.equal(installed.identity?.name, "bob");
    assert.equal(profiles.state("bob").publicationId, null);
    assert.equal(store.get<Asset>("asset", installed.package.manifest.assets[0]!)?.ownerId, "bob");
    assert.match(
      installed.package.files["owned.html"]!,
      new RegExp(installed.package.manifest.assets[0]!),
    );
    const assetCount = store.all("asset").length;
    const remixed = mods.install(bob, mod.id, {
      version: 1,
      draftId: installed.id,
      revision: 1,
      slot: "post",
    });
    assert.equal(remixed.revision, 2);
    assert.deepEqual(remixed.package.manifest.assets, installed.package.manifest.assets);
    assert.equal(store.all("asset").length, assetCount);
    const newDraft = profiles.update(
      alice,
      draft.id,
      { ...pkg, files: { ...pkg.files, "notes.js": "window.revisionTwo=true" } },
      1,
    );
    const updated = mods.share(alice, {
      ...input,
      submissionId: randomUUID(),
      revision: newDraft.revision,
      modId: mod.id,
      expectedVersion: 1,
    });
    assert.equal(updated.version, 2);
    assert.equal(mods.get(mod.id, 1).package.files["notes.js"], undefined);
    assert.equal(profiles.draft(bob, installed.id).package.files["notes.js"], undefined);
    assert.throws(
      () =>
        mods.share(bob, {
          ...input,
          submissionId: randomUUID(),
          draftId: installed.id,
          modId: mod.id,
          revision: 2,
          expectedVersion: 2,
        }),
      { code: "NOT_FOUND" },
    );
    assert.throws(
      () =>
        mods.share(alice, {
          ...input,
          submissionId: randomUUID(),
          revision: 2,
          modId: mod.id,
          expectedVersion: 1,
        }),
      { code: "MOD_CONFLICT" },
    );
    const before = store.all("asset").length;
    assert.throws(
      () =>
        mods.install(bob, mod.id, {
          version: 2,
          draftId: installed.id,
          revision: 99,
          slot: "post",
        }),
      { code: "REVISION_CONFLICT" },
    );
    // A filename collision is rejected before cloned media or draft changes are persisted.
    assert.throws(
      () =>
        mods.install(bob, mod.id, { version: 2, draftId: installed.id, revision: 2, slot: "post" }),
      { code: "PART_FILE_CONFLICT" },
    );
    assert.equal(store.all("asset").length, before);
    store.close();
    const restarted = await Store.open(path);
    try {
      assert.equal(
        new ModService(new ProfileService(new SocialService(restarted))).get(mod.id, 1).version,
        1,
      );
    } finally {
      restarted.close();
    }
  } finally {
    try {
      store.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});
test("partial sharing and profile polls isolate viewers, previews, owners and historical definitions", async () => {
  const { dir, store, profiles, mods, pkg } = await fixture();
  try {
    const alice = { userId: "alice" },
      bob = { userId: "bob" },
      carol = { userId: "carol" };
    const d = profiles.create(alice, pkg);
    const mod = mods.share(alice, {
      submissionId: randomUUID(),
      draftId: d.id,
      revision: 1,
      name: "Encore",
      description: "Voting only",
      slots: ["feature"],
      shareAssets: true,
    });
    assert.equal(mod.package.manifest.schemaVersion, 2);
    if (mod.package.manifest.schemaVersion !== 2) throw new Error("v2 expected");
    assert.deepEqual(Object.keys(mod.package.manifest.parts), ["feature"]);
    const preview = profiles.capability(alice, d.id, true, "profile.poll.vote", {
      option: "velvet",
    }) as any;
    assert.equal(preview.total, 1);
    assert.equal(preview.preview, true);
    const pub = profiles.publish(alice, d.id, 1, 0);
    const vote = (actor: { userId: string }, option: string) =>
      profiles.capability(actor, pub.publicationId!, false, "profile.poll.vote", { option }) as any;
    assert.equal(vote(bob, "velvet").total, 1);
    assert.equal(vote(bob, "first-light").total, 1);
    assert.equal(vote(carol, "first-light").total, 2);
    const read = profiles.capability(
      alice,
      pub.publicationId!,
      false,
      "profile.poll.read",
      undefined,
    ) as any;
    assert.equal(read.selected, null);
    assert.equal(read.options.find((o: any) => o.id === "first-light").votes, 2);
    assert.equal(read.votes, undefined);
    assert.throws(() =>
      profiles.capability(bob, pub.publicationId!, false, "profile.poll.vote", {
        option: "velvet",
        userId: "alice",
      }),
    );
    assert.throws(() => vote(bob, "unknown"), { code: "INVALID_OPTION" });
    const installed = mods.install(bob, mod.id, { version: 1 });
    const bp = profiles.publish(bob, installed.id, 1, 0);
    assert.equal(
      (profiles.capability(carol, bp.publicationId!, false, "profile.poll.read", undefined) as any)
        .total,
      0,
    );
    const removed = profiles.update(alice, d.id, composeProfilePart(pkg, null, "feature"), 1);
    const next = profiles.publish(alice, d.id, removed.revision, pub.version);
    assert.throws(() => vote(bob, "velvet"), { code: "CAPABILITY_DENIED" });
    profiles.restore(alice, pub.publicationId, next.version);
    assert.equal(
      (profiles.capability(bob, pub.publicationId!, false, "profile.poll.read", undefined) as any)
        .total,
      2,
    );
    const changed = structuredClone(pkg);
    if (changed.manifest.schemaVersion !== 2) throw new Error("v2 expected");
    changed.manifest.poll!.question = "A different show";
    const fresh = profiles.create(alice, changed);
    profiles.publish(alice, fresh.id, 1, profiles.state("alice").version);
    assert.throws(() => vote(bob, "velvet"), { code: "CAPABILITY_DENIED" });
    const bad = structuredClone(changed);
    if (bad.manifest.schemaVersion !== 2) throw new Error("v2 expected");
    bad.manifest.poll!.options[1]!.id = bad.manifest.poll!.options[0]!.id;
    assert.equal(profilePackageSchema.safeParse(bad).success, false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Smudge Paint wall parts mix with Ink & Paper both ways without file conflicts", async () => {
  const { smudgeProfilePackage } = await import("../apps/server/smudge-profile.js");
  const { rakaPackage } = await import("../apps/server/raka.js");
  // Smudge posts on an Ink & Paper profile bring their own scoped styles and helpers.
  const mixed = composeProfilePart(rakaPackage, smudgeProfilePackage, "post");
  assert.equal(
    mixed.manifest.schemaVersion === 2 && mixed.manifest.parts.post?.name,
    "Smudge / Selected walls",
  );
  for (const file of ["smudge/post.html", "smudge/parts.css", "smudge/helpers.js"])
    assert.ok(mixed.files[file], file);
  assert.match(mixed.files["smudge/post.html"]!, /href="smudge\/parts\.css"/);
  assert.match(mixed.files["smudge/post.html"]!, /src="smudge\/helpers\.js"/);
  // The Drawing Relay feature fits into the Smudge shell, which keeps a feature marker.
  const relay = composeProfilePart(smudgeProfilePackage, rakaPackage, "feature");
  assert.ok((relay.manifest.capabilities as string[]).includes("relay.add"));
  assert.match(relay.files["index.html"]!, /<!--forma:feature-->/);
});
