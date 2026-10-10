import assert from "node:assert/strict";
import test from "node:test";
import { eventSchema, postPackageSchema } from "../packages/contracts/src/index.js";
import { DomainError, InMemoryPostService } from "../packages/core/src/index.js";
import { simplePost } from "./fixtures.js";

test("owner can publish; retries return the same immutable snapshot", () => {
  const service = new InMemoryPostService();
  const actor = { userId: "alice" };
  const input = simplePost();
  const { draftId } = service.createDraft(actor, input);
  input.files["index.html"] = "changed after upload";
  const first = service.publish(actor, draftId);
  const original = structuredClone(first.post);
  first.post.postPackage.files["index.html"] = "changed after publication";
  assert.deepEqual(service.publish(actor, draftId).post, original);
  assert.equal(original.postPackage.files["index.html"], simplePost().files["index.html"]);
});

test("anonymous calls fail; a foreign draft and a missing draft have the same error", () => {
  const service = new InMemoryPostService();
  const { draftId } = service.createDraft({ userId: "alice" }, simplePost());
  assert.throws(() => service.createDraft(null, simplePost()), { code: "UNAUTHENTICATED" });
  assert.throws(() => service.publish(null, draftId), { code: "UNAUTHENTICATED" });
  for (const id of [draftId, "missing"]) {
    assert.throws(() => service.publish({ userId: "bob" }, id), { code: "NOT_FOUND" });
  }
});

test("reject unknown protocols, undeclared fields, unsupported capabilities and invalid files", () => {
  const base = simplePost();
  const invalid = [
    { ...base, ownerId: "admin" },
    { ...base, manifest: { ...base.manifest, schemaVersion: 2 } },
    { ...base, manifest: { ...base.manifest, runtimeVersion: "future" } },
    { ...base, manifest: { ...base.manifest, capabilities: ["database.admin"] } },
    {
      ...base,
      manifest: {
        ...base.manifest,
        capabilities: ["viewer.progress.read", "viewer.progress.read"],
      },
    },
    { ...base, files: {} },
    { ...base, files: { ...base.files, "../escape.js": "" } },
    { ...base, files: { "index.html": "x".repeat(100_001) } },
  ];
  for (const postPackage of invalid) {
    assert.equal(postPackageSchema.safeParse(postPackage).success, false);
    assert.throws(() => new InMemoryPostService().createDraft({ userId: "alice" }, postPackage), {
      code: "PACKAGE_INVALID",
    });
  }
});

test("digest follows content, independent of file insertion order", () => {
  const service = new InMemoryPostService();
  const actor = { userId: "alice" };
  const a = simplePost();
  a.files["script.js"] = "void 0";
  const b = simplePost();
  b.files = { "script.js": "void 0", ...b.files };
  const publish = (input: unknown) =>
    service.publish(actor, service.createDraft(actor, input).draftId).post;
  assert.equal(publish(a).packageDigest, publish(b).packageDigest);
  b.files["script.js"] = "void 1";
  assert.notEqual(publish(a).packageDigest, publish(b).packageDigest);
});

test("errors correlate with allowlisted events without recording package content or identity", () => {
  const service = new InMemoryPostService();
  let error: DomainError | undefined;
  try {
    service.createDraft({ userId: "private-user" }, { secret: "private-content" });
  } catch (caught) {
    assert.ok(caught instanceof DomainError);
    error = caught;
  }
  assert.ok(error);
  const events = service.getEvents();
  assert.equal(events[0]?.traceId, error.traceId);
  assert.equal(events[0]?.stage, "validate_package");
  for (const event of events) eventSchema.parse(event);
  assert.doesNotMatch(JSON.stringify(events), /private-user|private-content/);
  events.length = 0;
  assert.equal(service.getEvents().length, 1);
});
