import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { AccountService } from "../packages/core/src/accounts.js";
import { CommunityService } from "../packages/core/src/community.js";
import { MessageService } from "../packages/core/src/messages.js";
import { AppError } from "../packages/core/src/social.js";
import { renderMoment } from "../apps/server/moments.js";
import { googleFinish, googleStart } from "../apps/server/google.js";

const post = (title = "Hello") => ({
  package: {
    manifest: {
      schemaVersion: 1 as const,
      runtimeVersion: "web-v1" as const,
      name: title,
      entrypoint: "index.html",
      capabilities: [],
    },
    files: { "index.html": `<h1>${title}</h1>` },
  },
  metadata: { title, format: "custom", caption: "", contributors: [] },
});

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-com-")), "db.sqlite"));
  store.transaction(() => {
    for (const [id, name] of [
      ["ana", "Ana Lestari"],
      ["budi", "Budi Santoso"],
      ["citra", "Citra Dewi"],
      ["dian", "Dian Pratama"],
      ["mod", "Moderator"],
    ] as const)
      store.put("user", id, { id, name, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  const clock = { now: new Date("2026-03-10T10:00:00Z") };
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment, () => clock.now);
  const accounts = new AccountService(
    social,
    identity,
    { verify: (t) => `https://f.test/?verify=${t}`, reset: (t) => `https://f.test/?reset=${t}` },
    () => clock.now,
  );
  const community = new CommunityService(
    social,
    (id) => id === "mod",
    () => clock.now,
  );
  accounts.loginGate = (id) => {
    if (community.isSuspended(id)) throw new AppError("ACCOUNT_SUSPENDED", 403);
  };
  accounts.erasers.push((id) => community.erase(id));
  const messages = new MessageService(social, community, () => clock.now);
  const publish = (userId: string, title?: string) => {
    const draft = social.createDraft({ userId }, post(title));
    return social.publish({ userId }, draft.id, 1);
  };
  const later = (ms: number) => (clock.now = new Date(clock.now.getTime() + ms));
  return { store, social, identity, accounts, community, messages, publish, later };
}
const as = (userId: string) => ({ userId });
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

test("blocking hides posts both ways, ends follows and refuses new contact", async () => {
  const { social, community, publish } = await setup();
  const p = publish("ana", "Ana's day");
  social.follow(as("ana"), "budi");
  social.follow(as("budi"), "ana");
  assert.deepEqual(community.block(as("ana"), "budi"), { blocked: true });
  assert.deepEqual(social.following(as("ana")), []);
  assert.deepEqual(social.following(as("budi")), []);
  assert.ok(!social.feed(as("budi")).some((x) => x.id === p.id));
  rejects(() => social.visiblePost(as("budi"), p.id), "NOT_FOUND");
  rejects(() => social.comment(as("budi"), p.id, "hi"), "NOT_FOUND");
  rejects(() => social.toggle(as("budi"), p.id, "like"), "NOT_FOUND");
  rejects(() => social.follow(as("budi"), "ana"), "NOT_AVAILABLE");
  rejects(() => community.assertVisibleUser(as("budi"), "ana"), "NOT_FOUND");
  assert.equal(community.search(as("budi"), "ana").length, 0);
  // Others are unaffected; unblocking restores visibility.
  assert.ok(social.feed(as("citra")).some((x) => x.id === p.id));
  assert.deepEqual(
    community.blocked(as("ana")).map((u) => u.id),
    ["budi"],
  );
  community.block(as("ana"), "budi");
  assert.ok(social.feed(as("budi")).some((x) => x.id === p.id));
});

test("notifications for follows, likes, comments and stickers; deduplicated and filtered", async () => {
  const { social, community, publish } = await setup();
  const p = publish("ana");
  social.follow(as("budi"), "ana");
  social.toggle(as("budi"), p.id, "like");
  social.toggle(as("budi"), p.id, "like");
  social.toggle(as("budi"), p.id, "like");
  social.comment(as("citra"), p.id, "Nice");
  social.toggle(as("ana"), p.id, "like"); // own action: no notification
  const list = community.notifications(as("ana"));
  assert.deepEqual(list.map((n) => n.type).sort(), ["comment", "follow", "like"]);
  assert.equal(list.find((n) => n.type === "like")!.post!.title, "Hello");
  assert.equal(community.unread(as("ana")).count, 3);
  community.markRead(as("ana"));
  assert.equal(community.unread(as("ana")).count, 0);
  // A blocked person's activity disappears from your notifications.
  community.block(as("ana"), "citra");
  assert.ok(!community.notifications(as("ana")).some((n) => n.actor?.id === "citra"));
  assert.deepEqual(community.notifications(as("budi")), []);
});

test("people search ranks handles first and suggestions use friends of friends", async () => {
  const { social, community } = await setup();
  assert.deepEqual(
    community.search(as("ana"), "@bu").map((p) => p.id),
    ["budi"],
  );
  assert.deepEqual(
    community.search(as("ana"), "dewi").map((p) => p.id),
    ["citra"],
  );
  assert.ok(!community.search(as("ana"), "ana").some((p) => p.id === "ana"));
  social.follow(as("ana"), "budi");
  social.follow(as("budi"), "citra");
  social.follow(as("dian"), "citra");
  const [first] = community.suggestions(as("ana"));
  assert.equal(first!.id, "citra");
  assert.equal(first!.mutuals, 1);
  assert.ok(!community.suggestions(as("ana")).some((p) => p.id === "budi"));
});

test("moderators see grouped reports, remove posts and suspend accounts; others cannot", async () => {
  const { social, community, accounts, publish, later } = await setup();
  const p = publish("ana", "Spammy");
  social.report(as("budi"), p.id, "spam");
  social.report(as("citra"), p.id, "spam");
  rejects(() => community.reports(as("budi")), "NOT_FOUND");
  rejects(
    () => community.moderate(as("budi"), { target: "post", id: p.id, action: "remove" }),
    "NOT_FOUND",
  );
  const [item] = community.reports(as("mod"));
  assert.equal(item!.count, 2);
  assert.deepEqual(item!.reasons, { spam: 2 });
  later(1000);
  community.moderate(as("mod"), { target: "post", id: p.id, action: "remove" });
  assert.equal(community.reports(as("mod")).length, 0);
  assert.ok(!social.feed(as("budi")).some((x) => x.id === p.id));
  assert.ok(!social.feed(as("ana")).some((x) => x.id === p.id), "removed for the owner too");
  assert.ok(community.notifications(as("ana")).some((n) => n.type === "post-removed"));
  community.moderate(as("mod"), { target: "post", id: p.id, action: "restore" });
  assert.ok(social.feed(as("budi")).some((x) => x.id === p.id));

  // Suspension hides the person and ends their sessions.
  const { user, session } = accounts.register({
    name: "Eko",
    handle: "eko.w",
    email: "eko@example.com",
    password: "a long enough phrase",
  });
  const eko = publish(user.id, "Eko post");
  rejects(() => community.suspend(as("mod"), "mod", { suspended: true }), "INVALID_USER");
  community.suspend(as("mod"), user.id, { suspended: true });
  assert.equal(accounts.resolve(session), null);
  rejects(
    () => accounts.login({ login: "eko.w", password: "a long enough phrase" }),
    "ACCOUNT_SUSPENDED",
  );
  assert.ok(!social.feed(as("budi")).some((x) => x.id === eko.id));
  community.suspend(as("mod"), user.id, { suspended: false });
  assert.ok(accounts.login({ login: "eko.w", password: "a long enough phrase" }));
});

test("messages need the recipient to follow you, then flow both ways; blocks close them", async () => {
  const { social, community, messages, later } = await setup();
  rejects(() => messages.send(as("ana"), "budi", { text: "hi" }), "MESSAGE_NOT_ALLOWED");
  social.follow(as("budi"), "ana");
  messages.send(as("ana"), "budi", { text: "Hi Budi!" });
  assert.equal(messages.unread(as("budi")).count, 1);
  const thread = messages.thread(as("budi"), "ana");
  assert.equal(thread.messages[0]!.text, "Hi Budi!");
  assert.equal(messages.unread(as("budi")).count, 0);
  later(1000);
  messages.send(as("budi"), "ana", { text: "Hey!" });
  const [conversation] = messages.conversations(as("ana"));
  assert.equal(conversation!.user!.id, "budi");
  assert.equal(conversation!.unread, 1);
  assert.throws(() => messages.send(as("ana"), "budi", { text: "   " }));
  // Someone who neither follows nor wrote to you cannot be messaged.
  rejects(() => messages.send(as("ana"), "citra", { text: "hi" }), "MESSAGE_NOT_ALLOWED");
  community.block(as("budi"), "ana");
  rejects(() => messages.send(as("ana"), "budi", { text: "?" }), "MESSAGE_NOT_ALLOWED");
  assert.deepEqual(messages.conversations(as("ana")), []);
  rejects(() => messages.thread(as("ana"), "budi"), "NOT_FOUND");
});

test("deleting an account needs the password and removes sign-in, ties and visibility", async () => {
  const { social, accounts, community, messages, store, publish } = await setup();
  const { user, session } = accounts.register({
    name: "Fajar",
    handle: "fajar",
    email: "fajar@example.com",
    password: "a long enough phrase",
  });
  const me = as(user.id);
  const p = publish(user.id, "Mine");
  social.follow(me, "ana");
  social.follow(as("ana"), user.id);
  messages.send(me, "ana", { text: "hello" });
  rejects(() => accounts.deleteAccount(me, { password: "wrong" }), "LOGIN_INCORRECT");
  accounts.deleteAccount(me, { password: "a long enough phrase" });
  assert.equal(accounts.resolve(session), null);
  assert.ok(community.isDeleted(user.id));
  assert.equal(store.get<{ name: string }>("user", user.id)!.name, "Deleted account");
  assert.ok(!social.feed(as("ana")).some((x) => x.id === p.id));
  assert.deepEqual(social.following(as("ana")), []);
  assert.deepEqual(messages.conversations(as("ana")), []);
  assert.ok(!JSON.stringify(store.all("credential")).includes("fajar@example.com"));
  // The email can be used again for a new account.
  assert.ok(
    accounts.register({
      name: "Fajar",
      handle: "fajar2",
      email: "fajar@example.com",
      password: "another long phrase",
    }),
  );
  // Demo accounts without a password confirm with their handle.
  rejects(() => accounts.deleteAccount(as("dian"), { handle: "nope" }), "CONFIRMATION_MISMATCH");
  accounts.deleteAccount(as("dian"), { handle: "dian" });
  assert.ok(community.isDeleted("dian"));
});

test("Google sign-in creates, finds and only links to confirmed accounts", async () => {
  const { accounts } = await setup();
  const first = accounts.externalLogin("google", {
    sub: "g-1",
    email: "Gita@Example.com",
    name: "Gita Ayu",
  });
  assert.ok(first.created);
  const again = accounts.externalLogin("google", { sub: "g-1", email: "x@y.z", name: "" });
  assert.equal(again.userId, first.userId);
  assert.equal(again.created, false);
  assert.deepEqual(accounts.account({ userId: first.userId }), {
    userId: first.userId,
    email: "gita@example.com",
    emailVerified: true,
    hasPassword: false,
  });
  // An unconfirmed password account with the same email is never taken over.
  accounts.register({
    name: "Hadi",
    handle: "hadi",
    email: "hadi@example.com",
    password: "a long enough phrase",
  });
  rejects(
    () => accounts.externalLogin("google", { sub: "g-2", email: "hadi@example.com", name: "H" }),
    "EMAIL_NOT_CONFIRMED_FOR_LINKING",
  );
  // Handles are derived from the email and kept unique.
  const twin = accounts.externalLogin("google", { sub: "g-3", email: "gita@other.com", name: "G" });
  assert.notEqual(twin.userId, first.userId);
});

test("Google flow uses PKCE and refuses unverified Google emails", async () => {
  const config = { clientId: "cid", clientSecret: "sec", redirectUri: "https://f.test/cb" };
  const start = googleStart(config);
  const url = new URL(start.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), start.state);
  assert.notEqual(url.searchParams.get("code_challenge"), start.verifier);
  const calls: string[] = [];
  const fake = (verified: boolean) =>
    (async (target: string, init: RequestInit) => {
      calls.push(String(target));
      if (String(target).includes("token")) {
        assert.match(String(init.body), /code_verifier=/);
        return Response.json({ access_token: "at" });
      }
      return Response.json({ sub: "1", email: "a@b.c", email_verified: verified, name: "A" });
    }) as unknown as typeof fetch;
  assert.deepEqual(await googleFinish(config, "code", start.verifier, fake(true)), {
    sub: "1",
    email: "a@b.c",
    name: "A",
  });
  await assert.rejects(
    googleFinish(config, "code", start.verifier, fake(false)),
    /GOOGLE_EMAIL_UNVERIFIED/,
  );
  assert.ok(calls.some((c) => c.startsWith("https://oauth2.googleapis.com/token")));
});
