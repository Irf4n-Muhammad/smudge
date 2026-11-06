import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { OrgService } from "../packages/core/src/orgs.js";
import { OrgEventsService } from "../packages/core/src/org-events.js";
import { renderMoment } from "../apps/server/moments.js";
import { findWhen } from "../packages/contracts/src/when.js";

const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-rooms-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["maya", "leo", "dani", "ines"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  let now = new Date("2026-11-02T10:00:00Z");
  const clock = () => now;
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment, clock);
  const orgs = new OrgService(social, identity, clock);
  const events = new OrgEventsService(social, orgs, clock);
  const org = orgs.createOrg({ userId: "dani" }, { name: "Room club", term: "2026/27" });
  identity.redeemInvite({ userId: "maya" }, orgs.joinLink({ userId: "dani" }, org.id));
  const [term] = orgs.terms(org.id);
  return {
    store,
    identity,
    orgs,
    events,
    org,
    term: term!,
    at: (iso: string) => {
      now = new Date(iso);
    },
  };
}

test("a chat message's day is found when it's said plainly", () => {
  const today = new Date(2026, 10, 5); // Thursday 5 Nov 2026
  assert.equal(findWhen("Rehearsal tomorrow at 7", today), "2026-11-06");
  assert.equal(findWhen("tonight!", today), "2026-11-05");
  assert.equal(findWhen("Tech run Friday 6pm, main stage", today), "2026-11-06");
  assert.equal(findWhen("Thursday again?", today), "2026-11-05");
  assert.equal(findWhen("next Thursday", today), "2026-11-12");
  assert.equal(findWhen("Show on Nov 20th", today), "2026-11-20");
  assert.equal(findWhen("deadline 3 jan", today), "2027-01-03");
  assert.equal(findWhen("we sat in the sun", today), null);
  assert.equal(findWhen("you may join later", today), null);
  assert.equal(findWhen("Feb 30", today), null);
});

test("free tickets open in waves, fill up, and the line moves when someone gives theirs back", async () => {
  const { events, orgs, org, at, identity } = await setup();
  const { stamp } = orgs.createEvent({ userId: "dani" }, org.id, { name: "Spring Show" });
  rejects(
    () =>
      events.setTickets({ userId: "maya" }, org.id, stamp.id, {
        when: "2026-12-01T19:00:00Z",
        place: "Main hall",
        capacity: 2,
        firstWave: "2026-11-03T09:00:00Z",
      }),
    "ORG_ADMIN_REQUIRED",
  );
  events.setTickets({ userId: "dani" }, org.id, stamp.id, {
    when: "2026-12-01T19:00:00Z",
    place: "Main hall",
    capacity: 2,
    firstWave: "2026-11-03T09:00:00Z",
    everyone: "2026-11-04T09:00:00Z",
  });
  // Before the first wave nobody can claim; Maya is one of the club's own, so she's first.
  rejects(() => events.claim({ userId: "maya" }, org.id, stamp.id), "TICKETS_NOT_OPEN");
  at("2026-11-03T10:00:00Z");
  assert.equal(events.claim({ userId: "maya" }, org.id, stamp.id).mine?.status, "going");
  rejects(() => events.claim({ userId: "leo" }, org.id, stamp.id), "TICKETS_NOT_OPEN");
  assert.equal(events.view(org.id, stamp.id, "leo").yourWave, "everyone");
  at("2026-11-04T10:00:00Z");
  assert.equal(events.claim({ userId: "leo" }, org.id, stamp.id).mine?.status, "going");
  const ines = events.claim({ userId: "ines" }, org.id, stamp.id);
  assert.deepEqual(ines.mine, { status: "waiting", place: 1 });
  assert.equal(ines.left, 0);
  // Claiming again changes nothing.
  assert.equal(events.claim({ userId: "leo" }, org.id, stamp.id).waiting, 1);
  rejects(
    () =>
      events.setTickets({ userId: "dani" }, org.id, stamp.id, {
        when: "2026-12-01T19:00:00Z",
        place: "Main hall",
        capacity: 1,
        firstWave: "2026-11-03T09:00:00Z",
      }),
    "CAPACITY_BELOW_TAKEN",
  );
  events.release({ userId: "leo" }, org.id, stamp.id);
  assert.equal(events.view(org.id, stamp.id, "ines").mine?.status, "going");
  assert.equal(events.list(org.id, "leo").length, 1);
  // Someone who came to an earlier event holds the club's stamp and joins the first wave.
  identity.grantChapter({
    ownerId: "leo",
    kind: "stamp",
    label: "Crew, Old show",
    orgId: org.id,
    method: "invite",
    audience: "public",
  });
  assert.equal(events.firstWave("leo", org.id), true);
  at("2026-12-02T10:00:00Z");
  rejects(() => events.claim({ userId: "leo" }, org.id, stamp.id), "EVENT_OVER");
  assert.equal(events.list(org.id).length, 0);
});

test("the door QR lets in a ticket holder who scans it with their own phone, once", async () => {
  const { events, orgs, org, at, store } = await setup();
  const { stamp } = orgs.createEvent({ userId: "dani" }, org.id, { name: "Open mic" });
  events.setTickets({ userId: "dani" }, org.id, stamp.id, {
    when: "2026-11-02T19:00:00Z",
    place: "Cafe",
    capacity: 1,
    firstWave: "2026-11-01T09:00:00Z",
  });
  events.claim({ userId: "maya" }, org.id, stamp.id);
  rejects(() => events.door({ userId: "maya" }, org.id, stamp.id), "ORG_ADMIN_REQUIRED");
  const door = events.door({ userId: "dani" }, org.id, stamp.id);
  const code = door.path.split(".").pop()!;
  assert.match(door.path, new RegExp(`^/o/${org.id}\\?door=${stamp.id}\\.`));
  rejects(() => events.arrive({ userId: "leo" }, org.id, stamp.id, { code }), "NO_TICKET");
  assert.ok(events.arrive({ userId: "maya" }, org.id, stamp.id, { code }).mine?.arrivedAt);
  assert.equal(events.door({ userId: "dani" }, org.id, stamp.id).arrived, 1);
  rejects(() => events.release({ userId: "maya" }, org.id, stamp.id), "ALREADY_ARRIVED");
  // A code from a few minutes ago no longer opens the door.
  at("2026-11-02T10:05:00Z");
  rejects(() => events.arrive({ userId: "maya" }, org.id, stamp.id, { code }), "DOOR_CODE_EXPIRED");
  // A forged code is refused.
  const secret = store.get<{ secret: string }>("event-tickets", `${org.id}:${stamp.id}`)!.secret;
  const wrong = createHmac("sha256", `${secret}x`).update("x").digest("base64url").slice(0, 8);
  rejects(
    () => events.arrive({ userId: "maya" }, org.id, stamp.id, { code: wrong }),
    "DOOR_CODE_EXPIRED",
  );
});

test("slow mode, muting, reports and blocks keep the room's talk decent", async () => {
  const { orgs, org, term, at, identity } = await setup();
  identity.redeemInvite({ userId: "leo" }, orgs.joinLink({ userId: "dani" }, org.id));
  rejects(
    () => orgs.setSlow({ userId: "maya" }, org.id, term.id, { seconds: 30 }),
    "ORG_ADMIN_REQUIRED",
  );
  assert.throws(() => orgs.setSlow({ userId: "dani" }, org.id, term.id, { seconds: 7 }));
  orgs.setSlow({ userId: "dani" }, org.id, term.id, { seconds: 30 });
  const first = orgs.post({ userId: "maya" }, org.id, term.id, { text: "hello" });
  rejects(() => orgs.post({ userId: "maya" }, org.id, term.id, { text: "again" }), "SLOW_MODE");
  orgs.post({ userId: "dani" }, org.id, term.id, { text: "admins never wait" });
  orgs.post({ userId: "dani" }, org.id, term.id, { text: "see" });
  at("2026-11-02T10:00:31Z");
  orgs.post({ userId: "maya" }, org.id, term.id, { text: "again" });

  // Leo reports Maya's first message; the admin sees it and takes it down.
  rejects(
    () => orgs.report({ userId: "maya" }, org.id, term.id, first.id, { reason: "spam" }),
    "CANT_REPORT_SELF",
  );
  orgs.report({ userId: "leo" }, org.id, term.id, first.id, { reason: "spam" });
  orgs.report({ userId: "leo" }, org.id, term.id, first.id, { reason: "spam" });
  const seen = orgs.room({ userId: "dani" }, org.id, term.id);
  assert.deepEqual(
    seen.reports?.map((r) => [r.post.text, r.count, r.reasons]),
    [["hello", 1, ["spam"]]],
  );
  assert.equal(orgs.room({ userId: "maya" }, org.id, term.id).reports, undefined);
  rejects(
    () => orgs.removePost({ userId: "leo" }, org.id, term.id, first.id),
    "ORG_ADMIN_REQUIRED",
  );
  orgs.removePost({ userId: "dani" }, org.id, term.id, first.id);
  assert.deepEqual(orgs.room({ userId: "dani" }, org.id, term.id).reports, []);

  // Muted, Maya still reads but can't talk until the admin lets her.
  rejects(
    () => orgs.setMute({ userId: "dani" }, org.id, term.id, { userId: "dani", muted: true }),
    "CANT_MUTE_ADMIN",
  );
  orgs.setMute({ userId: "dani" }, org.id, term.id, { userId: "maya", muted: true });
  at("2026-11-02T10:05:00Z");
  rejects(() => orgs.post({ userId: "maya" }, org.id, term.id, { text: "hm" }), "MUTED");
  assert.equal(orgs.room({ userId: "maya" }, org.id, term.id).muted, true);
  orgs.setMute({ userId: "dani" }, org.id, term.id, { userId: "maya", muted: false });
  orgs.post({ userId: "maya" }, org.id, term.id, { text: "back" });

  // Leo blocked Maya: her messages are gone from his view, and his from hers.
  orgs.blockedEither = (a, b) => [a, b].sort().join() === "leo,maya";
  const leoSees = orgs.room({ userId: "leo" }, org.id, term.id).messages.map((m) => m.author.id);
  assert.equal(leoSees.includes("maya"), false);
  assert.equal(leoSees.includes("dani"), true);
});

test("a locked term keeps a yearbook for the people who were there", async () => {
  const { orgs, org, term, identity, at } = await setup();
  orgs.setState({ userId: "dani" }, org.id, term.id, {
    kind: "decision",
    text: "Spring show: Hamlet",
  });
  orgs.setState({ userId: "dani" }, org.id, term.id, {
    kind: "schedule",
    text: "Auditions",
    when: "2026-11-20",
  });
  orgs.post({ userId: "maya" }, org.id, term.id, { text: "First!" });
  at("2026-11-02T11:00:00Z");
  orgs.post({ userId: "dani" }, org.id, term.id, { kind: "announcement", text: "Thank you all" });
  assert.equal(orgs.room({ userId: "maya" }, org.id, term.id).yearbook, null);
  orgs.startTerm({ userId: "dani" }, org.id, { label: "2027/28", from: 2027 });
  const book = orgs.room({ userId: "maya" }, org.id, term.id).yearbook!;
  assert.equal(book.label, "2026/27");
  assert.deepEqual(book.counts, { messages: 1, announcements: 1, decisions: 1, scheduled: 1 });
  assert.deepEqual(book.decisions, ["Spring show: Hamlet"]);
  assert.deepEqual(book.firstWord, { name: "maya", text: "First!" });
  assert.deepEqual(book.lastNote, { name: "dani", text: "Thank you all" });
  assert.deepEqual(
    book.people.map((p) => [p.id, p.role]),
    [["maya", "Member"]],
  );
  // Made once: later changes don't rewrite it.
  identity.redeemInvite({ userId: "leo" }, orgs.joinLink({ userId: "dani" }, org.id));
  assert.equal(orgs.room({ userId: "maya" }, org.id, term.id).yearbook!.madeAt, book.madeAt);
});
