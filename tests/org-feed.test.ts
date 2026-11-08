import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { OrgService } from "../packages/core/src/orgs.js";
import { OprecService } from "../packages/core/src/oprec.js";
import { renderMoment } from "../apps/server/moments.js";

const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-orgfeed-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["maya", "leo", "dani", "ines", "budi"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  let now = new Date("2026-11-02T10:00:00Z");
  const clock = () => now;
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment, clock);
  const orgs = new OrgService(social, identity, clock);
  const oprecs = new OprecService(social, identity, orgs, clock);
  const org = orgs.createOrg({ userId: "dani" }, { name: "Feed club", term: "2026/27" });
  const [term] = orgs.terms(org.id);
  return {
    store,
    social,
    identity,
    orgs,
    oprecs,
    org,
    term: term!,
    at: (iso: string) => {
      now = new Date(iso);
    },
  };
}

test("following an organisation brings its published posts to your feed, with what they carry", async () => {
  const { orgs, oprecs, org, at, identity } = await setup();
  rejects(
    () =>
      orgs.submitPost({ userId: "dani" }, org.id, { text: "Apply!", attach: { kind: "oprec" } }),
    "ATTACH_UNKNOWN",
  );
  orgs.attachable = (_id, a) => a.kind === "oprec" && !!oprecs.current(org.id);
  rejects(
    () =>
      orgs.submitPost({ userId: "dani" }, org.id, { text: "Apply!", attach: { kind: "oprec" } }),
    "ATTACH_UNKNOWN",
  );
  oprecs.create({ userId: "dani" }, org.id, {
    title: "Crew",
    roles: ["Events"],
    closes: "2026-11-20",
  });
  orgs.submitPost({ userId: "dani" }, org.id, {
    text: "Apply right here.",
    attach: { kind: "oprec" },
  });
  assert.deepEqual(orgs.feedPosts("leo"), [], "nobody follows it yet");

  const f = orgs.follow({ userId: "leo" }, org.id);
  assert.deepEqual(f, { following: true, followers: 1 });
  const [post] = orgs.feedPosts("leo");
  assert.equal(post?.text, "Apply right here.");
  assert.deepEqual(post?.attach, { kind: "oprec" });
  assert.equal(post?.member, false);
  assert.equal(orgs.publicPage(org.id, "leo").following, true);
  assert.equal(orgs.publicPage(org.id, "leo").followers, 1);

  // Its own people get it without following; a draft waiting for an admin reaches nobody.
  identity.redeemInvite({ userId: "maya" }, orgs.joinLink({ userId: "dani" }, org.id));
  at("2026-11-02T11:00:00Z");
  orgs.submitPost({ userId: "maya" }, org.id, { text: "A draft from Maya." });
  assert.deepEqual(
    orgs.feedPosts("maya").map((p) => [p.text, p.member]),
    [["Apply right here.", true]],
  );

  // A private organisation leaves the feed of people outside it, and can't be followed by them.
  orgs.setVisibility({ userId: "dani" }, org.id, { visibility: "private" });
  assert.deepEqual(orgs.feedPosts("leo"), []);
  rejects(() => orgs.follow({ userId: "ines" }, org.id), "NOT_FOUND");
  orgs.setVisibility({ userId: "dani" }, org.id, { visibility: "public" });
  assert.deepEqual(orgs.follow({ userId: "leo" }, org.id), { following: false, followers: 0 });
  assert.deepEqual(orgs.feedPosts("leo"), []);
});

test("divisions from the recruitment get rooms of their own; leaders see every one", async () => {
  const { orgs, oprecs, org, term, identity } = await setup();
  const oprec = oprecs.create({ userId: "dani" }, org.id, {
    title: "Crew",
    roles: ["Costume", "Stage crew"],
    closes: "2026-11-20",
  });
  for (const [userId, role] of [
    ["maya", "Costume"],
    ["leo", "Stage crew"],
  ] as const) {
    const app = oprecs.apply({ userId }, org.id, oprec.id, { role });
    oprecs.decide({ userId: "dani" }, org.id, oprec.id, app.id, { accept: true });
  }
  // Ines applied but wasn't accepted: no division for her.
  oprecs.apply({ userId: "ines" }, org.id, oprec.id, { role: "Costume" });
  assert.deepEqual(
    orgs.divisions(term).map((d) => [d.key, d.people]),
    [
      ["costume", ["maya"]],
      ["stage-crew", ["leo"]],
    ],
  );

  const mayas = orgs.room({ userId: "maya" }, org.id, term.id);
  assert.deepEqual(
    mayas.rooms.map((r) => r.label),
    ["Everyone", "Costume"],
  );
  orgs.post({ userId: "maya" }, org.id, term.id, { text: "Fitting Thursday", room: "costume" });
  orgs.post({ userId: "leo" }, org.id, term.id, { text: "Hello all" });
  rejects(
    () => orgs.post({ userId: "leo" }, org.id, term.id, { text: "Let me in", room: "costume" }),
    "NOT_IN_DIVISION",
  );
  rejects(() => orgs.room({ userId: "leo" }, org.id, term.id, "costume"), "NOT_IN_DIVISION");
  rejects(
    () =>
      orgs.post({ userId: "dani" }, org.id, term.id, {
        kind: "announcement",
        text: "Only for costume",
        room: "costume",
      }),
    "ANNOUNCE_TO_ALL",
  );
  // The everyone room doesn't show a division's talk; the division's room shows only its own.
  assert.deepEqual(
    orgs.room({ userId: "maya" }, org.id, term.id).messages.map((m) => m.text),
    ["Hello all"],
  );
  assert.deepEqual(
    orgs.room({ userId: "maya" }, org.id, term.id, "costume").messages.map((m) => m.text),
    ["Fitting Thursday"],
  );
  // The admin who runs the term sees every division.
  assert.deepEqual(
    orgs.room({ userId: "dani" }, org.id, term.id).rooms.map((r) => r.key),
    [null, "costume", "stage-crew"],
  );
  void identity;
});

test("while you were away: announcements, decisions and mentions since you last opened, then caught up", async () => {
  const { orgs, oprecs, org, term, at, identity, store } = await setup();
  identity.redeemInvite({ userId: "maya" }, orgs.joinLink({ userId: "dani" }, org.id));
  identity.redeemInvite({ userId: "leo" }, orgs.joinLink({ userId: "dani" }, org.id));
  assert.equal(orgs.room({ userId: "maya" }, org.id, term.id).missed, null, "first visit");
  at("2026-11-03T10:00:00Z");
  orgs.post({ userId: "dani" }, org.id, term.id, { kind: "announcement", text: "Show is on" });
  orgs.setState({ userId: "dani" }, org.id, term.id, { kind: "decision", text: "Paper House" });
  orgs.post({ userId: "leo" }, org.id, term.id, { text: "@maya can you bring the props?" });
  orgs.post({ userId: "leo" }, org.id, term.id, { text: "anyone else?" });
  orgs.post({ userId: "maya" }, org.id, term.id, { text: "my own message doesn't count" });

  // In Messages, the organisation is one row with what's new.
  const [row] = orgs.inbox({ userId: "maya" });
  assert.equal(row?.name, "Feed club");
  assert.equal(row?.unread, 3);
  assert.equal(row?.last?.text, "my own message doesn't count");

  at("2026-11-03T12:00:00Z");
  const missed = orgs.room({ userId: "maya" }, org.id, term.id).missed;
  assert.equal(missed?.messages, 2);
  assert.deepEqual(
    missed?.items.map((i) => [i.kind, i.text]),
    [
      ["announcement", "Show is on"],
      ["decision", "Paper House"],
      ["mention", "@maya can you bring the props?"],
    ],
  );
  assert.equal(orgs.room({ userId: "maya" }, org.id, term.id).missed, null, "caught up");
  assert.equal(orgs.inbox({ userId: "maya" })[0]?.unread, 0);
  // Someone outside the organisation has no row.
  assert.deepEqual(orgs.inbox({ userId: "budi" }), []);
  void oprecs;
  void store;
});
