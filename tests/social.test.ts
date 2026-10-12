import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import {
  experienceSchema,
  metadataSchema,
  type Experience,
} from "../packages/contracts/src/experience.js";
import { renderDocument, runtimeCsp } from "../packages/runtime/src/document.js";

const packageV2 = (): Experience => ({
  manifest: {
    schemaVersion: 2,
    runtimeVersion: "web-v1",
    name: "Test",
    entrypoint: "index.html",
    assets: [],
    capabilities: [
      "viewer.progress.read",
      "viewer.progress.write",
      "contributions.create",
      "contributions.read",
      "polls.read",
      "polls.vote",
    ],
    poll: { question: "Which?", options: ["A", "B"] },
  },
  files: { "index.html": "<h1>Hello</h1>" },
});
const input = () => ({
  package: packageV2(),
  metadata: { title: "Test", format: "custom", caption: "", contributors: ["bob"] },
});

test("optional world stage preserves legacy packages and rejects unsafe host styling", () => {
  const pkg = packageV2();
  assert.equal(experienceSchema.safeParse(pkg).success, true);
  const stage = {
    background: "#e9e8de",
    ink: "#3b4131",
    nightBackground: "#20251f",
    nightInk: "#e3e7d6",
    height: 780,
  };
  const withStage = (overrides = {}) => ({
    ...pkg,
    manifest: { ...pkg.manifest, stage: { ...stage, ...overrides } },
  });
  assert.equal(experienceSchema.safeParse(withStage()).success, true);
  for (const bad of [
    { background: "url(https://example.com)" },
    { height: 100000 },
    { height: 559 },
    { position: "fixed" },
  ]) {
    assert.equal(experienceSchema.safeParse(withStage(bad)).success, false);
  }
});
test("post buttons open the post itself or an https page, never script or plain http", () => {
  const meta = (link: unknown) => metadataSchema.safeParse({ title: "Tickets", link });
  assert.equal(meta(undefined).success, true);
  assert.equal(meta({ label: "Get tickets" }).success, true);
  assert.equal(meta({ label: "Read it", url: "https://example.com/page?x=1" }).success, true);
  for (const bad of [
    { label: "Run", url: "javascript:alert(1)" },
    { label: "Old", url: "http://example.com" },
    { label: "Data", url: "data:text/html,<b>x</b>" },
    { label: "Creds", url: "https://user:pass@example.com" },
    { label: "", url: "https://example.com" },
    { label: "x".repeat(33) },
    { label: "Extra", target: "_top" },
  ])
    assert.equal(meta(bad).success, false, JSON.stringify(bad));
});

test("persistent publication, revision conflicts, viewer isolation and contribution ACLs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forma-test-")),
    filename = join(dir, "db.sqlite");
  let store = await Store.open(filename);
  try {
    store.transaction(() => {
      for (const id of ["alice", "bob", "eve"]) store.put("user", id, { id });
    });
    let service = new SocialService(store);
    const alice = { userId: "alice" },
      bob = { userId: "bob" },
      eve = { userId: "eve" };
    const draft = service.createDraft(alice, input());
    assert.throws(() => service.draft(bob, draft.id), { code: "NOT_FOUND" });
    assert.throws(() => service.publish(bob, draft.id, 1), { code: "NOT_FOUND" });
    const post = service.publish(alice, draft.id, 1);
    assert.equal(service.publish(alice, draft.id, 1).id, post.id);
    const next = service.updateDraft(
      alice,
      draft.id,
      { ...input(), package: { ...packageV2(), files: { "index.html": "<h1>Changed</h1>" } } },
      1,
    );
    assert.equal(next.revision, 2);
    assert.throws(() => service.publish(alice, draft.id, 1), { code: "REVISION_CONFLICT" });
    assert.equal(service.post(post.id).package.files["index.html"], "<h1>Hello</h1>");
    service.capability(bob, post.id, "viewer.progress.write", { page: 3 });
    assert.deepEqual(service.capability(eve, post.id, "viewer.progress.read", undefined), {});
    service.capability(bob, post.id, "contributions.create", { text: "My memory" });
    assert.throws(
      () => service.capability(eve, post.id, "contributions.create", { text: "Intrusion" }),
      { code: "CONTRIBUTOR_REQUIRED" },
    );
    service.capability(bob, post.id, "polls.vote", { option: 0 });
    const voted = service.capability(bob, post.id, "polls.vote", { option: 1 }) as {
      counts: number[];
    };
    assert.deepEqual(voted.counts, [0, 1]);
    service.capability(alice, draft.id, "viewer.progress.write", { page: 9 }, true);
    assert.deepEqual(service.capability(alice, post.id, "viewer.progress.read", undefined), {});
    store.close();
    store = await Store.open(filename);
    service = new SocialService(store);
    assert.equal(service.post(post.id).digest, post.digest);
    assert.deepEqual(service.capability(bob, post.id, "viewer.progress.read", undefined), {
      page: 3,
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("reject absent capabilities, forged identities, and asset access", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forma-acl-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  try {
    store.transaction(() => store.put("user", "alice", { id: "alice" }));
    const service = new SocialService(store),
      actor = { userId: "alice" };
    const pkg = packageV2();
    pkg.manifest.capabilities = [];
    const data = { package: pkg, metadata: { title: "A", contributors: [] } };
    assert.throws(() => service.createDraft(actor, { ...data, ownerId: "eve" }));
    assert.throws(() => service.createDraft({ userId: "eve" }, data), { code: "UNAUTHENTICATED" });
    const d = service.createDraft(actor, data);
    const p = service.publish(actor, d.id, 1);
    assert.throws(() => service.capability(actor, p.id, "viewer.progress.read", undefined), {
      code: "CAPABILITY_DENIED",
    });
    assert.throws(() => service.asset(actor, "missing"), { code: "NOT_FOUND" });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("renderer bundles declared files and fixes isolation policy outside creator control", () => {
  const p = packageV2();
  p.files = {
    "index.html": '<link rel="stylesheet" href="style.css"><script src="script.js"></script>',
    "script.js": "document.body.dataset.ready='yes'",
    "style.css": "body{color:red}",
  };
  const html = renderDocument(p, "test-nonce", {});
  assert.match(html, /window,'forma'/);
  assert.match(html, /body\{color:red\}/);
  assert.match(html, /dataset.ready/);
  assert.match(runtimeCsp, /connect-src 'none'/);
  assert.match(runtimeCsp, /sandbox allow-scripts allow-forms;/);
  assert.doesNotMatch(runtimeCsp, /allow-same-origin|unsafe-eval/);
});
