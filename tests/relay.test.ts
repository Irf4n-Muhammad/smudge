import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import { composeProfilePart } from "../packages/core/src/composition.js";
import {
  profilePackageSchema,
  profileDocument,
  type RelayContribution,
} from "../packages/contracts/src/profile.js";
import { rakaPackage, basicPackage } from "../apps/server/raka.js";

const fixture = () => {
  const p = structuredClone(rakaPackage);
  p.manifest.assets = [];
  return p;
};
const mark = () => ({
  submissionId: randomUUID(),
  strokes: [
    {
      color: "#202020",
      width: 5,
      points: [
        [100, 100],
        [200, 200],
      ],
    },
  ],
});
test("profile v2 composes partial source, removes feature permissions, and rejects ambiguous files", () => {
  const original = fixture();
  const mixed = composeProfilePart(original, basicPackage, "post");
  assert.equal(mixed.manifest.schemaVersion, 2);
  assert.match(profileDocument(mixed).files["index.html"]!, /class="post-grid"/);
  assert.match(profileDocument(mixed).files["index.html"]!, /DRAWING RELAY/);
  const removed = composeProfilePart(mixed, null, "feature");
  assert.ok(!removed.manifest.capabilities.includes("relay.add" as never));
  assert.doesNotMatch(profileDocument(removed).files["index.html"]!, /DRAWING RELAY/);
  assert.deepEqual(original, fixture());
  const conflict = structuredClone(basicPackage);
  conflict.files["raka/base.css"] = "changed";
  assert.throws(() => composeProfilePart(original, conflict, "post"), {
    code: "PART_FILE_CONFLICT",
  });
  assert.throws(() => composeProfilePart(original, basicPackage, "feature"), {
    code: "PART_NOT_PROVIDED",
  });
  const missing = fixture();
  delete missing.files["raka/post.html"];
  assert.equal(profilePackageSchema.safeParse(missing).success, false);
  const legacy = { ...original, manifest: { ...original.manifest, schemaVersion: 1 } };
  assert.equal(profilePackageSchema.safeParse(legacy).success, false);
});
test("relay survives design changes and restart, blocks disabled historical writes and isolates preview", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forma-relay-"));
  let store = await Store.open(join(dir, "test.sqlite"));
  try {
    store.transaction(() => {
      for (const id of ["alice", "bob"])
        store.put("user", id, {
          id,
          name: id,
          handle: id,
          bio: "",
          initials: id,
          color: "#ffffff",
        });
    });
    let profiles = new ProfileService(new SocialService(store));
    const alice = { userId: "alice" },
      bob = { userId: "bob" };
    let draft = profiles.create(alice, fixture());
    let state = profiles.publish(alice, draft.id, 1, 0);
    const oldId = state.publicationId!;
    const input = mark();
    const saved = profiles.capability(bob, oldId, false, "relay.add", input) as RelayContribution;
    assert.equal(saved.userId, "bob");
    assert.equal(saved.name, "bob");
    assert.deepEqual(profiles.capability(bob, oldId, false, "relay.add", input), saved);
    assert.throws(() => profiles.capability(alice, oldId, false, "relay.add", input), {
      code: "SUBMISSION_CONFLICT",
    });
    assert.throws(() =>
      profiles.capability(bob, oldId, false, "relay.add", { ...mark(), userId: "alice" }),
    );
    assert.throws(() =>
      profiles.capability(bob, oldId, false, "relay.add", {
        ...mark(),
        strokes: [{ color: "#202020", width: 5, points: [[Infinity, 0]] }],
      }),
    );
    profiles.capability(alice, draft.id, true, "relay.add", mark());
    assert.equal(
      (profiles.capability(bob, oldId, false, "relay.read", undefined) as unknown[]).length,
      1,
    );
    assert.throws(() => profiles.capability(bob, draft.id, true, "relay.read", undefined), {
      code: "NOT_FOUND",
    });
    draft = profiles.update(
      alice,
      draft.id,
      composeProfilePart(draft.package, null, "feature"),
      draft.revision,
    );
    state = profiles.publish(alice, draft.id, draft.revision, state.version);
    assert.throws(() => profiles.capability(bob, oldId, false, "relay.add", mark()), {
      code: "CAPABILITY_DENIED",
    });
    draft = profiles.update(alice, draft.id, fixture(), draft.revision);
    state = profiles.publish(alice, draft.id, draft.revision, state.version);
    assert.equal(
      (profiles.capability(bob, state.publicationId!, false, "relay.read", undefined) as unknown[])
        .length,
      1,
    );
    assert.equal(
      (profiles.capability(alice, draft.id, true, "relay.read", undefined) as unknown[]).length,
      0,
    );
    store.close();
    store = await Store.open(join(dir, "test.sqlite"));
    profiles = new ProfileService(new SocialService(store));
    assert.deepEqual(
      profiles.capability(bob, state.publicationId!, false, "relay.read", undefined),
      [saved],
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
