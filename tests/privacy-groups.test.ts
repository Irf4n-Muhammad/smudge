import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { CommunityService } from "../packages/core/src/community.js";
import { PrivacyService } from "../packages/core/src/privacy.js";
import { MessageService } from "../packages/core/src/messages.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import { SharingService } from "../packages/core/src/sharing.js";
import { buildPost, startPostDesign } from "../packages/core/src/easy-post.js";
import { renderMoment } from "../apps/server/moments.js";

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-priv-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["ana", "budi", "citra", "dian", "eko"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  const social = new SocialService(store);
  // A fixed day outside every season, so a season default never replaces the chosen theme.
  const identity = new IdentityService(
    social,
    renderMoment,
    () => new Date("2026-03-10T10:00:00Z"),
  );
  const community = new CommunityService(social, () => false);
  const privacy = new PrivacyService(social, community);
  const messages = new MessageService(social, community);
  const sharing = new SharingService(social, community, identity, new ProfileService(social));
  const publish = (userId: string, headline: string, caption = "") => {
    const built = buildPost({ ...startPostDesign("note"), headline, photos: [] });
    const d = social.createDraft(
      { userId },
      { ...built, metadata: { ...built.metadata, caption, contributors: [] } },
    );
    return social.publish({ userId }, d.id, 1);
  };
  const inbox = (userId: string) =>
    community.notifications({ userId }).map((n) => `${n.type}:${n.actor?.id}`);
  return { store, social, identity, community, privacy, messages, sharing, publish, inbox };
}
const as = (userId: string) => ({ userId });
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);
const sees = (social: SocialService, userId: string, postId: string) =>
  social.feed(as(userId)).some((p) => p.id === postId);

test("private accounts: posts only for accepted followers; following becomes a request", async () => {
  const { social, privacy, sharing, publish, inbox } = await setup();
  const before = publish("ana", "Old post");
  privacy.setPrivate(as("ana"), { private: true });
  const p = publish("ana", "Family dinner", "with @budi");
  assert.ok(sees(social, "ana", p.id));
  assert.ok(!sees(social, "budi", p.id));
  assert.ok(!sees(social, "budi", before.id));
  assert.ok(!social.explore(as("budi"), "family").length);
  rejects(() => sharing.post(p.id), "NOT_FOUND");
  assert.deepEqual(sharing.profile("ana").posts, []);
  // Mentioned but not allowed to see it: no notification.
  assert.deepEqual(inbox("budi"), []);

  assert.deepEqual(social.follow(as("budi"), "ana"), { active: false, requested: true });
  assert.deepEqual(privacy.requested(as("budi")), ["ana"]);
  assert.deepEqual(inbox("ana"), ["follow-request:budi"]);
  // Asking again withdraws the request.
  assert.deepEqual(social.follow(as("budi"), "ana"), { active: false, requested: false });
  assert.deepEqual(privacy.requests(as("ana")), []);
  social.follow(as("budi"), "ana");
  social.follow(as("citra"), "ana");
  assert.deepEqual(
    privacy
      .requests(as("ana"))
      .map((r) => r.user.id)
      .sort(),
    ["budi", "citra"],
  );
  privacy.answer(as("ana"), "budi", true);
  privacy.answer(as("ana"), "citra", false);
  rejects(() => privacy.answer(as("ana"), "citra", true), "NOT_FOUND");
  assert.ok(sees(social, "budi", p.id));
  assert.ok(!sees(social, "citra", p.id));
  assert.ok(inbox("budi").includes("follow-accepted:ana"));
  assert.deepEqual(social.following(as("citra")), []);

  privacy.removeFollower(as("ana"), "budi");
  assert.ok(!sees(social, "budi", p.id));
});

test("going public accepts waiting requests; blocking clears them", async () => {
  const { social, community, privacy, publish } = await setup();
  privacy.setPrivate(as("ana"), { private: true });
  const p = publish("ana", "Hello");
  social.follow(as("budi"), "ana");
  social.follow(as("citra"), "ana");
  community.block(as("ana"), "citra");
  assert.deepEqual(
    privacy.requests(as("ana")).map((r) => r.user.id),
    ["budi"],
  );
  privacy.setPrivate(as("ana"), { private: false });
  assert.ok(social.following(as("budi")).includes("ana"));
  assert.ok(sees(social, "dian", p.id));
  assert.deepEqual(social.follow(as("dian"), "ana"), { active: true });
  assert.equal(privacy.isPrivate("ana"), false);
});

test("groups: only people you could message, members only, leaving hands over the group", async () => {
  const { social, community, messages } = await setup();
  for (const id of ["budi", "citra", "dian"]) social.follow(as(id), "ana");
  rejects(
    () => messages.createGroup(as("ana"), { name: "Trip", members: ["budi", "eko"] }),
    "MEMBER_NOT_ALLOWED",
  );
  rejects(
    () => messages.createGroup(as("ana"), { name: "Trip", members: ["budi", "ana"] }),
    "GROUP_TOO_SMALL",
  );
  const g = messages.createGroup(as("ana"), { name: "Trip", members: ["budi", "citra"] });
  assert.deepEqual(
    g.members.map((m) => m.id),
    ["ana", "budi", "citra"],
  );
  messages.sendToGroup(as("budi"), g.id, { text: "Hi all" });
  messages.sendToGroup(as("citra"), g.id, { text: "Yo" });
  assert.equal(messages.groups(as("ana"))[0]!.unread, 2);
  assert.equal(messages.unread(as("ana")).count, 2);
  const thread = messages.groupThread(as("ana"), g.id);
  assert.deepEqual(
    thread.messages.map((m) => [m.from?.id, m.text]),
    [
      ["budi", "Hi all"],
      ["citra", "Yo"],
    ],
  );
  assert.equal(messages.groups(as("ana"))[0]!.unread, 0);
  rejects(() => messages.groupThread(as("eko"), g.id), "NOT_FOUND");
  rejects(() => messages.sendToGroup(as("eko"), g.id, { text: "let me in" }), "NOT_FOUND");
  rejects(() => messages.renameGroup(as("budi"), g.id, "Mine"), "FORBIDDEN");
  rejects(() => messages.removeMember(as("budi"), g.id, "citra"), "FORBIDDEN");
  // Budi can add only people Budi could message.
  rejects(() => messages.addMember(as("budi"), g.id, "dian"), "MEMBER_NOT_ALLOWED");
  messages.addMember(as("ana"), g.id, "dian");

  // Blocking hides that person's messages from you, without removing them from the group.
  community.block(as("citra"), "budi");
  assert.deepEqual(
    messages.groupThread(as("citra"), g.id).messages.map((m) => m.text),
    ["Yo"],
  );

  messages.removeMember(as("ana"), g.id, "ana");
  assert.equal(messages.groupThread(as("budi"), g.id).owner, true);
  for (const id of ["budi", "citra", "dian"]) messages.removeMember(as(id), g.id, id);
  assert.equal(social.store.all("group").length, 0);
  assert.equal(social.store.all("group-message").length, 0);
});

test("deleting an account removes their group messages and seat", async () => {
  const { social, messages } = await setup();
  for (const id of ["budi", "citra"]) social.follow(as(id), "ana");
  const g = messages.createGroup(as("ana"), { name: "Trip", members: ["budi", "citra"] });
  messages.sendToGroup(as("ana"), g.id, { text: "mine" });
  messages.sendToGroup(as("budi"), g.id, { text: "theirs" });
  social.store.transaction(() => messages.erase("ana"));
  const view = messages.groupThread(as("budi"), g.id);
  assert.deepEqual(
    view.members.map((m) => m.id),
    ["budi", "citra"],
  );
  assert.equal(view.owner, true);
  assert.deepEqual(
    view.messages.map((m) => m.text),
    ["theirs"],
  );
});

test("a theme on the profile follows who may see the owner's posts", async () => {
  const { social, identity, community, privacy } = await setup();
  identity.chooseDecoration(as("ana"), { decorationId: "cat-peek", scope: "base" });
  assert.equal(identity.themeFor(as("budi"), "ana")?.id, "cat-peek");
  privacy.setPrivate(as("ana"), { private: true });
  assert.equal(identity.themeFor(as("budi"), "ana"), null);
  assert.equal(identity.themeFor(as("ana"), "ana")?.id, "cat-peek");
  social.follow(as("budi"), "ana");
  privacy.answer(as("ana"), "budi", true);
  assert.equal(identity.themeFor(as("budi"), "ana")?.id, "cat-peek");
  community.block(as("ana"), "budi");
  assert.equal(identity.themeFor(as("budi"), "ana"), null);
});
