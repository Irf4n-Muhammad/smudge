import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import {
  profilePackageSchema,
  profileSizeSchema,
  type ProfilePackage,
} from "../packages/contracts/src/profile.js";

const pkg = (): ProfilePackage => ({
  manifest: {
    kind: "profile",
    schemaVersion: 1,
    runtimeVersion: "web-v1",
    name: "Test profile",
    entrypoint: "index.html",
    height: 900,
    assets: [],
    capabilities: ["profile.read", "profile.openPost"],
  },
  files: { "index.html": "<h1>Hello</h1>" },
});
test("profile publication, restoration and owner ACLs survive restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forma-profile-"));
  let store = await Store.open(join(dir, "db.sqlite"));
  try {
    store.transaction(() => {
      for (const id of ["alice", "bob"])
        store.put("user", id, {
          id,
          name: id,
          handle: id,
          bio: "hello",
          initials: id,
          color: "#fff",
        });
    });
    let social = new SocialService(store),
      profiles = new ProfileService(social);
    const alice = { userId: "alice" },
      bob = { userId: "bob" };
    const d = profiles.create(alice, pkg());
    assert.throws(() => profiles.draft(bob, d.id), { code: "NOT_FOUND" });
    assert.throws(() => profiles.update(bob, d.id, pkg(), 1), { code: "NOT_FOUND" });
    assert.throws(() => profiles.publish(bob, d.id, 1, 0), { code: "NOT_FOUND" });
    assert.throws(() => profiles.update(alice, d.id, pkg(), 9), { code: "REVISION_CONFLICT" });
    const first = profiles.publish(alice, d.id, 1, 0);
    assert.deepEqual(profiles.publish(alice, d.id, 1, 0), first);
    const changed = pkg();
    changed.files["index.html"] = "<h1>Changed</h1>";
    profiles.update(alice, d.id, changed, 1);
    const next = profiles.publish(alice, d.id, 2, 1);
    assert.equal(
      profiles.publication(first.publicationId!).package.files["index.html"],
      "<h1>Hello</h1>",
    );
    assert.throws(() => profiles.restore(bob, first.publicationId, 0), { code: "NOT_FOUND" });
    assert.throws(() => profiles.restore(alice, first.publicationId, 1), {
      code: "PROFILE_CONFLICT",
    });
    profiles.restore(alice, first.publicationId, next.version);
    assert.throws(() => profiles.publish(alice, d.id, 2, 1), { code: "PROFILE_CONFLICT" });
    assert.equal(profiles.public("alice").publicationId, first.publicationId);
    store.close();
    store = await Store.open(join(dir, "db.sqlite"));
    social = new SocialService(store);
    profiles = new ProfileService(social);
    assert.equal(profiles.public("alice").publicationId, first.publicationId);
    assert.equal(profiles.history(alice).length, 2);
    const state = profiles.state("alice");
    profiles.restore(alice, null, state.version);
    assert.equal(profiles.public("alice").publicationId, null);
    assert.equal(profiles.history(bob).length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("profile data and navigation expose owner publications only, capabilities and assets remain checked", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forma-profile-acl-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  try {
    store.transaction(() => {
      for (const id of ["alice", "bob"])
        store.put("user", id, {
          id,
          name: id,
          handle: id,
          bio: "",
          initials: id[0],
          color: "#111111",
        });
    });
    const social = new SocialService(store),
      profiles = new ProfileService(social),
      alice = { userId: "alice" },
      bob = { userId: "bob" };
    const make = (actor: { userId: string }) => {
      const d = social.createDraft(actor, {
        package: {
          manifest: {
            schemaVersion: 2,
            runtimeVersion: "web-v1",
            name: "Post",
            entrypoint: "index.html",
            assets: [],
            capabilities: [],
          },
          files: { "index.html": "hello" },
        },
        metadata: { title: "public" },
      });
      return social.publish(actor, d.id, 1);
    };
    const own = make(alice),
      foreign = make(bob);
    const d = profiles.create(alice, pkg());
    const pub = profiles.publish(alice, d.id, 1, 0);
    const data = profiles.capability(
      bob,
      pub.publicationId!,
      false,
      "profile.read",
      undefined,
    ) as any;
    assert.deepEqual(
      data.posts.map((p: any) => p.id),
      [own.id],
    );
    assert.equal(data.posts[0].saved, undefined);
    assert.equal(data.viewer, undefined);
    assert.deepEqual(
      profiles.capability(bob, pub.publicationId!, false, "profile.openPost", { postId: own.id }),
      { postId: own.id },
    );
    assert.throws(
      () =>
        profiles.capability(bob, pub.publicationId!, false, "profile.openPost", {
          postId: foreign.id,
        }),
      { code: "NOT_FOUND" },
    );
    assert.throws(() => profiles.capability(bob, d.id, true, "profile.read", undefined), {
      code: "NOT_FOUND",
    });
    assert.throws(
      () => profiles.capability(bob, pub.publicationId!, false, "viewer.progress.write", {}),
      { code: "CAPABILITY_DENIED" },
    );
    const restricted = pkg();
    restricted.manifest.capabilities = [];
    const locked = profiles.create(alice, restricted);
    assert.throws(() => profiles.capability(alice, locked.id, true, "profile.read", undefined), {
      code: "CAPABILITY_DENIED",
    });
    restricted.manifest.assets = ["10000000-0000-4000-8000-000000000009"];
    assert.throws(() => profiles.create(alice, restricted), { code: "ASSET_NOT_ACCESSIBLE" });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("profile schema bounds source, height and host access declarations", () => {
  assert.equal(profilePackageSchema.safeParse(pkg()).success, true);
  for (const input of [
    { ...pkg(), ownerId: "bob" },
    { ...pkg(), files: { "../bad.js": "oops" } },
    { ...pkg(), files: { "index.html": "x".repeat(100001) } },
    { ...pkg(), manifest: { ...pkg().manifest, height: 100000 } },
    { ...pkg(), manifest: { ...pkg().manifest, capabilities: ["host.dom.write"] } },
  ])
    assert.equal(profilePackageSchema.safeParse(input).success, false);
});

test("profile social grants bind targets and actors, reject preview writes and revoke old grants", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forma-profile-social-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  try {
    store.transaction(() => {
      for (const id of ["alice", "bob"])
        store.put("user", id, {
          id,
          name: id,
          handle: id,
          bio: "",
          initials: id[0],
          color: "#111111",
        });
    });
    const social = new SocialService(store),
      profiles = new ProfileService(social),
      alice = { userId: "alice" },
      bob = { userId: "bob" };
    const make = (actor: { userId: string }) => {
      const d = social.createDraft(actor, {
        package: {
          manifest: {
            schemaVersion: 2,
            runtimeVersion: "web-v1",
            name: "Post",
            entrypoint: "index.html",
            assets: [],
            capabilities: [],
          },
          files: { "index.html": "hello" },
        },
        metadata: { title: "Public" },
      });
      return social.publish(actor, d.id, 1);
    };
    const own = make(alice),
      foreign = make(bob);
    const p: ProfilePackage = {
      ...pkg(),
      manifest: {
        ...pkg().manifest,
        schemaVersion: 2,
        parts: {},
        capabilities: ["profile.social.read", "profile.social.toggle"],
      },
    };
    assert.equal(
      profilePackageSchema.safeParse({ ...p, manifest: { ...p.manifest, schemaVersion: 1 } })
        .success,
      false,
    );
    const d = profiles.create(alice, p),
      pub = profiles.publish(alice, d.id, 1, 0);
    const call = (input: unknown) =>
      profiles.capability(bob, pub.publicationId!, false, "profile.social.toggle", input) as any;
    assert.throws(() => call({ action: "like", postId: foreign.id }), { code: "NOT_FOUND" });
    assert.throws(() => call({ action: "like", postId: own.id, userId: "alice" }));
    assert.throws(
      () =>
        profiles.capability(alice, d.id, true, "profile.social.toggle", {
          action: "like",
          postId: own.id,
        }),
      { code: "PREVIEW_READ_ONLY" },
    );
    assert.equal(call({ action: "like", postId: own.id }).posts[0].liked, true);
    assert.equal(social.feed(alice).find((p) => p.id === own.id)!.liked, false);
    assert.equal(call({ action: "save", postId: own.id }).posts[0].saved, true);
    assert.equal(call({ action: "follow" }).following, true);
    assert.deepEqual(social.following(bob), ["alice"]);
    const locked = profiles.create(alice, pkg());
    profiles.publish(alice, locked.id, 1, pub.version);
    assert.throws(() => call({ action: "like", postId: own.id }), { code: "CAPABILITY_DENIED" });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("covers require declared owned media and expose only owner-bound published photos", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forma-cover-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  try {
    store.transaction(() => {
      for (const id of ["alice", "bob"])
        store.put("user", id, { id, name: id, handle: id, bio: "", initials: id, color: "#fff" });
    });
    const social = new SocialService(store),
      profiles = new ProfileService(social);
    const alice = { userId: "alice" },
      bob = { userId: "bob" };
    const asset = social.upload(alice, {
      name: "photo.png",
      mime: "image/png",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    });
    const input = {
      package: {
        manifest: {
          schemaVersion: 2,
          runtimeVersion: "web-v1",
          name: "Photo",
          entrypoint: "index.html",
          assets: [asset.id],
          capabilities: [],
        },
        files: { "index.html": "<p>Photo</p>" },
      },
      metadata: { title: "My photo", caption: "My caption", coverAssetId: asset.id },
    };
    assert.throws(() => social.createDraft(bob, input), { code: "ASSET_NOT_ACCESSIBLE" });
    assert.throws(
      () =>
        social.createDraft(alice, {
          ...input,
          package: { ...input.package, manifest: { ...input.package.manifest, assets: [] } },
        }),
      { code: "COVER_NOT_DECLARED" },
    );
    const draft = social.createDraft(alice, input);
    assert.throws(
      () =>
        social.updateDraft(
          alice,
          draft.id,
          {
            ...input,
            package: { ...input.package, manifest: { ...input.package.manifest, assets: [] } },
          },
          1,
        ),
      { code: "COVER_NOT_DECLARED" },
    );
    assert.throws(() => social.asset(bob, asset.id), { code: "NOT_FOUND" });
    const profile: ProfilePackage = {
      ...pkg(),
      manifest: {
        ...pkg().manifest,
        schemaVersion: 2,
        parts: {},
        capabilities: ["profile.read", "profile.cover"],
      },
    };
    const pd = profiles.create(alice, profile),
      state = profiles.publish(alice, pd.id, 1, 0);
    const cover = (postId: string) =>
      profiles.capability(bob, state.publicationId!, false, "profile.cover", { postId }) as {
        src: string;
        alt: string;
      };
    assert.throws(() => cover(draft.id), { code: "NOT_FOUND" });
    const post = social.publish(alice, draft.id, 1);
    assert.equal(cover(post.id).alt, "My photo");
    assert.match(cover(post.id).src, /^data:image\/png;base64,/);
    assert.equal(profiles.data(bob, "alice").posts[0]!.hasCover, true);
    const foreignDraft = social.createDraft(bob, {
      ...input,
      package: { ...input.package, manifest: { ...input.package.manifest, assets: [] } },
      metadata: { title: "Other" },
    });
    const foreign = social.publish(bob, foreignDraft.id, 1);
    assert.throws(() => cover(foreign.id), { code: "NOT_FOUND" });
    assert.throws(() =>
      profiles.capability(bob, state.publicationId!, false, "profile.cover", {
        postId: post.id,
        assetId: asset.id,
      }),
    );
    const legacy = profiles.create(alice, pkg());
    assert.throws(
      () => profiles.capability(alice, legacy.id, true, "profile.cover", { postId: post.id }),
      { code: "CAPABILITY_DENIED" },
    );
    profiles.publish(alice, legacy.id, 1, state.version);
    assert.throws(() => cover(post.id), { code: "CAPABILITY_DENIED" });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("automatic profile sizing is opt-in v2 and layout messages stay bounded", () => {
  const original = pkg();
  assert.equal(profilePackageSchema.safeParse(original).success, true);
  assert.equal(
    profilePackageSchema.safeParse({
      ...original,
      manifest: { ...original.manifest, autoHeight: true },
    }).success,
    false,
  );
  const modern = {
    ...original,
    manifest: { ...original.manifest, schemaVersion: 2, parts: {}, autoHeight: true },
  };
  assert.equal(profilePackageSchema.safeParse(modern).success, true);
  for (const height of [-1, 0, 599, 8001, Infinity, NaN, "1200", 600.5])
    assert.equal(
      profileSizeSchema.safeParse({ type: "forma:size", nonce: "test", height }).success,
      false,
    );
  assert.equal(
    profileSizeSchema.safeParse({ type: "forma:size", nonce: "test", height: 1200 }).success,
    true,
  );
  assert.equal(
    profileSizeSchema.safeParse({ type: "forma:size", nonce: "test", height: 1200, actor: "raka" })
      .success,
    false,
  );
});
