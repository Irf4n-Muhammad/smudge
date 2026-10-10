import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import {
  applyProfileDesign,
  defaultProfileDesign,
  readProfileDesign,
} from "../packages/core/src/profile-design.js";
import { rakaPackage } from "../apps/server/raka.js";

const avatarId = "60000000-0000-4000-8000-000000000001";
const foreignId = "60000000-0000-4000-8000-000000000002";
test("profile identity stays private until atomic publish, restores with history and survives restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forma-identity-"));
  const path = join(dir, "db.sqlite");
  let store = await Store.open(path);
  try {
    store.transaction(() => {
      for (const id of ["alice", "bob"])
        store.put("user", id, {
          id,
          name: id,
          handle: id,
          bio: "Original bio",
          initials: id[0],
          color: "#111111",
        });
      for (const [id, ownerId] of [
        [avatarId, "alice"],
        [foreignId, "bob"],
      ])
        store.put("asset", id!, {
          id,
          ownerId,
          name: "Synthetic test avatar",
          mime: "image/png",
          base64: "aGVsbG8=",
        });
    });
    let profiles = new ProfileService(new SocialService(store));
    const alice = { userId: "alice" },
      bob = { userId: "bob" };
    const pkg = {
      manifest: {
        kind: "profile",
        schemaVersion: 1,
        runtimeVersion: "web-v1",
        name: "Identity test",
        entrypoint: "index.html",
        height: 900,
        assets: [],
        capabilities: ["profile.read"],
      },
      files: { "index.html": "<h1>Profile</h1>" },
    };
    const original = profiles.create(alice, pkg);
    const initial = profiles.publish(alice, original.id, 1, 0);
    const draft = profiles.create(alice, pkg);
    const identity = { name: "Nova Sketch", bio: "Ink & paper", avatarAssetId: avatarId };
    assert.throws(() => profiles.update(bob, draft.id, pkg, 1, identity), { code: "NOT_FOUND" });
    assert.throws(() => profiles.update(alice, draft.id, pkg, 1, { ...identity, ownerId: "bob" }));
    assert.throws(
      () => profiles.update(alice, draft.id, pkg, 1, { ...identity, avatarAssetId: foreignId }),
      { code: "ASSET_NOT_ACCESSIBLE" },
    );
    const saved = profiles.update(alice, draft.id, pkg, 1, identity);
    assert.equal(profiles.data(bob, "alice").owner.name, "alice");
    assert.throws(() => profiles.publicAvatar("alice"), { code: "NOT_FOUND" });
    const preview = profiles.capability(alice, saved.id, true, "profile.read", undefined) as {
      owner: { name: string; avatarSrc: string };
    };
    assert.equal(preview.owner.name, "Nova Sketch");
    assert.ok(preview.owner.avatarSrc.startsWith("data:image/png;base64,"));
    assert.throws(() => profiles.publish(alice, saved.id, saved.revision, 0), {
      code: "PROFILE_CONFLICT",
    });
    assert.equal(profiles.data(bob, "alice").owner.name, "alice");
    const published = profiles.publish(alice, saved.id, saved.revision, initial.version);
    assert.equal(profiles.data(bob, "alice").owner.name, "Nova Sketch");
    assert.equal(profiles.publicAvatar("alice").id, avatarId);
    const next = profiles.restore(alice, initial.publicationId, published.version);
    assert.equal(profiles.data(bob, "alice").owner.name, "alice");
    assert.throws(() => profiles.publicAvatar("alice"), { code: "NOT_FOUND" });
    profiles.restore(alice, published.publicationId, next.version);
    const legacy = { ...profiles.publication(initial.publicationId!) };
    delete legacy.identity;
    store.transaction(() => store.put("profile-publication", legacy.id, legacy));
    profiles.restore(alice, legacy.id, profiles.state("alice").version);
    assert.equal(profiles.data(bob, "alice").owner.name, "Nova Sketch");
    const sourceOnly = profiles.update(alice, saved.id, pkg, saved.revision);
    assert.deepEqual(sourceOnly.identity, identity);
    assert.throws(
      () => profiles.update(alice, saved.id, pkg, saved.revision, { ...identity, name: "Stale" }),
      { code: "REVISION_CONFLICT" },
    );
    store.close();
    store = await Store.open(path);
    profiles = new ProfileService(new SocialService(store));
    assert.equal(profiles.data(bob, "alice").owner.name, "Nova Sketch");
    assert.equal(profiles.draft(alice, saved.id).identity?.avatarAssetId, avatarId);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("visual authoring preserves arbitrary source and grants while round-tripping composition", () => {
  const source = structuredClone(rakaPackage);
  source.files["author-notes.js"] = "window.myInteraction = () => 42;";
  const config = {
    ...defaultProfileDesign,
    columns: 3,
    card: "round",
    order: ["profile", "post", "story", "feature"],
  };
  const edited = applyProfileDesign(source, config);
  assert.equal(edited.files["author-notes.js"], source.files["author-notes.js"]);
  assert.equal(edited.files["raka/profile.html"], source.files["raka/profile.html"]);
  assert.deepEqual(edited.manifest.capabilities, source.manifest.capabilities);
  assert.deepEqual(readProfileDesign(edited), config);
  assert.ok(
    edited.files["index.html"]!.indexOf("<!--forma:post-->") <
      edited.files["index.html"]!.indexOf("<!--forma:story-->"),
  );
  const again = applyProfileDesign(edited, { ...config, columns: 1 });
  assert.equal((again.files["index.html"]!.match(/src="personal\/boot.js"/g) ?? []).length, 1);
  assert.throws(() =>
    applyProfileDesign(source, { ...config, illustrationAssetId: "javascript:alert(1)" }),
  );
  assert.throws(() =>
    applyProfileDesign(source, { ...config, order: ["post", "post", "story", "feature"] }),
  );
  assert.equal(
    readProfileDesign({
      ...edited,
      files: { ...edited.files, "personal/design.js": "window.formaDesign = {}; alert(1);" },
    }),
    null,
  );
});
