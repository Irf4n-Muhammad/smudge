import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService, mentionedHandles } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { CommunityService } from "../packages/core/src/community.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import { SharingService } from "../packages/core/src/sharing.js";
import { renderMoment } from "../apps/server/moments.js";

const post = (title = "Hello", caption = "") => ({
  package: {
    manifest: {
      schemaVersion: 2 as const,
      runtimeVersion: "web-v1" as const,
      name: title,
      entrypoint: "index.html",
      capabilities: ["viewer.progress.write" as const],
      assets: [],
    },
    files: { "index.html": `<h1>${title}</h1>` },
  },
  metadata: { title, format: "custom" as const, caption, contributors: [] },
});
async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-basics-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["ana", "budi", "citra", "dian"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment);
  const community = new CommunityService(social, () => false);
  const sharing = new SharingService(social, community, identity, new ProfileService(social));
  const publish = (userId: string, title?: string, caption?: string) => {
    const draft = social.createDraft({ userId }, post(title, caption));
    return social.publish({ userId }, draft.id, 1);
  };
  const inbox = (userId: string) =>
    community.notifications({ userId }).map((n) => `${n.type}:${n.actor?.id}`);
  return { store, social, identity, community, sharing, publish, inbox };
}
const as = (userId: string) => ({ userId });
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

test("republishing a draft edits its post in place and keeps likes and comments", async () => {
  const { social, publish } = await setup();
  const first = publish("ana", "Before");
  social.toggle(as("budi"), first.id, "like");
  social.comment(as("budi"), first.id, "nice");
  const draft = social.editPost(as("ana"), first.id);
  assert.equal(draft.id, first.sourceDraftId);
  const next = social.updateDraft(as("ana"), draft.id, post("After"), draft.revision);
  const edited = social.publish(as("ana"), draft.id, next.revision);
  assert.equal(edited.id, first.id);
  assert.equal(edited.createdAt, first.createdAt);
  assert.ok(edited.editedAt);
  assert.notEqual(edited.digest, first.digest);
  const view = social.feed(as("budi")).filter((p) => p.ownerId === "ana");
  assert.equal(view.length, 1);
  assert.equal(view[0]!.metadata.title, "After");
  assert.equal(view[0]!.likes, 1);
  assert.equal(view[0]!.comments, 1);
  // Publishing the same revision again is still a no-op.
  assert.equal(social.publish(as("ana"), draft.id, next.revision).revision, edited.revision);
});

test("only the owner edits or deletes; a lost draft is recreated and linked", async () => {
  const { store, social, publish } = await setup();
  const p = publish("ana");
  rejects(() => social.editPost(as("budi"), p.id), "FORBIDDEN");
  rejects(() => social.deletePost(as("budi"), p.id), "FORBIDDEN");
  store.transaction(() => store.remove("draft", p.sourceDraftId));
  const fresh = social.editPost(as("ana"), p.id);
  assert.notEqual(fresh.id, p.sourceDraftId);
  assert.equal(social.post(p.id).sourceDraftId, fresh.id);
  // Its revision matches the post, so publishing it unchanged changes nothing.
  assert.equal(social.publish(as("ana"), fresh.id, fresh.revision).digest, p.digest);
});

test("moments cannot be edited", async () => {
  const { store, social, publish } = await setup();
  const p = publish("ana");
  store.transaction(() => store.put("moment", p.id, { kind: "paper", audience: "public" }));
  rejects(() => social.editPost(as("ana"), p.id), "MOMENT_NOT_EDITABLE");
  const draft = social.draft(as("ana"), p.sourceDraftId);
  const next = social.updateDraft(as("ana"), draft.id, post("Rewritten"), draft.revision);
  rejects(() => social.publish(as("ana"), draft.id, next.revision), "MOMENT_NOT_EDITABLE");
});

test("deleting a post removes what people left on it but keeps the draft", async () => {
  const { store, social, identity, publish, inbox } = await setup();
  const p = publish("ana");
  const other = publish("ana", "Other");
  social.toggle(as("budi"), p.id, "like");
  social.toggle(as("budi"), p.id, "save");
  social.toggle(as("budi"), other.id, "like");
  social.comment(as("budi"), p.id, "hi");
  social.report(as("citra"), p.id, "spam");
  social.capability(as("budi"), p.id, "viewer.progress.write", { page: 2 });
  identity.react(as("budi"), p.id, {
    sticker: identity.reactions(as("budi"), p.id).options[0]!.id,
  });
  assert.equal(inbox("ana").length, 4);
  assert.deepEqual(social.deletePost(as("ana"), p.id), { deleted: true });
  rejects(() => social.post(p.id), "NOT_FOUND");
  for (const kind of ["like", "save", "report", "progress", "reaction"])
    assert.ok(!store.ids(kind).some((k) => k.startsWith(`${p.id}:`)), kind);
  assert.equal(store.all("comment").length, 0);
  assert.deepEqual(inbox("ana"), ["like:budi"]);
  assert.ok(social.draft(as("ana"), p.sourceDraftId));
  assert.equal(social.feed(as("budi")).find((x) => x.id === other.id)?.likes, 1);
});

test("replies stay one level deep and notify the person answered", async () => {
  const { social, publish, inbox } = await setup();
  const p = publish("ana");
  const top = social.comment(as("budi"), p.id, "first");
  const reply = social.comment(as("citra"), p.id, "answer", top.id);
  assert.equal(reply.parentId, top.id);
  const deeper = social.comment(as("dian"), p.id, "and me", reply.id);
  assert.equal(deeper.parentId, top.id);
  assert.ok(inbox("budi").includes("reply:citra"));
  assert.ok(inbox("citra").includes("reply:dian"));
  // Answering the post owner's own comment is one notification, not two.
  const own = social.comment(as("ana"), p.id, "thanks all");
  social.comment(as("budi"), p.id, "welcome", own.id);
  assert.equal(inbox("ana").filter((n) => n.endsWith(":budi")).length, 2);
  const elsewhere = publish("budi");
  rejects(() => social.comment(as("citra"), elsewhere.id, "x", top.id), "NOT_FOUND");
});

test("authors and post owners delete comments; replies go with them", async () => {
  const { store, social, publish } = await setup();
  const p = publish("ana");
  const top = social.comment(as("budi"), p.id, "first");
  social.comment(as("citra"), p.id, "reply", top.id);
  const lone = social.comment(as("citra"), p.id, "lone");
  rejects(() => social.deleteComment(as("dian"), top.id), "FORBIDDEN");
  rejects(() => social.deleteComment(as("budi"), lone.id), "FORBIDDEN");
  social.deleteComment(as("citra"), lone.id);
  social.deleteComment(as("ana"), top.id);
  assert.equal(store.all("comment").length, 0);
  rejects(() => social.deleteComment(as("ana"), top.id), "NOT_FOUND");
});

test("@mentions notify people who can see the post, once, and respect blocks", async () => {
  const { social, community, publish, inbox } = await setup();
  assert.deepEqual(mentionedHandles("hi @Budi, @citra. me@mail.com @budi @x"), ["budi", "citra"]);
  const p = publish("ana", "Day", "with @budi and @nobody");
  assert.deepEqual(inbox("budi"), ["mention:ana"]);
  community.block(as("dian"), "ana");
  social.comment(as("citra"), p.id, "@dian @ana @budi look");
  assert.deepEqual(inbox("dian"), []);
  assert.ok(inbox("ana").includes("comment:citra"));
  assert.ok(!inbox("ana").includes("mention:citra"));
  assert.ok(inbox("budi").includes("mention:citra"));
  // Editing the caption only tells people who were not named before.
  const draft = social.editPost(as("ana"), p.id);
  const next = social.updateDraft(
    as("ana"),
    draft.id,
    post("Day", "with @budi and @citra"),
    draft.revision,
  );
  social.publish(as("ana"), draft.id, next.revision);
  assert.ok(inbox("citra").includes("mention:ana"));
  assert.equal(inbox("budi").filter((n) => n === "mention:ana").length, 1);
});

test("share links show public posts and profiles to guests, nothing hidden", async () => {
  const { store, social, community, sharing, publish } = await setup();
  const p = publish("ana", "Open", "hello");
  social.comment(as("budi"), p.id, "lovely");
  const view = sharing.post(p.id);
  assert.equal(view.title, "Open");
  assert.equal(view.author.handle, "ana");
  assert.equal(view.comments[0]!.author!.handle, "budi");
  assert.equal("email" in view.author, false);
  const profile = sharing.profile("ANA");
  assert.deepEqual(
    profile.posts.map((x) => x.id),
    [p.id],
  );
  // Moments, removed posts and suspended people stay out of share links.
  const moment = publish("ana", "Moment");
  store.transaction(() => store.put("moment", moment.id, { kind: "paper", audience: "public" }));
  rejects(() => sharing.post(moment.id), "NOT_FOUND");
  store.transaction(() =>
    store.put("moderation", `post:${p.id}`, { action: "remove", by: "x", at: "" }),
  );
  rejects(() => sharing.post(p.id), "NOT_FOUND");
  store.transaction(() => store.put("suspension", "budi", { by: "x", at: "" }));
  rejects(() => sharing.profile("budi"), "NOT_FOUND");
  void community;
});
