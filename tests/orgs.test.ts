import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { OrgService } from "../packages/core/src/orgs.js";
import { renderMoment } from "../apps/server/moments.js";
import { CommunityService } from "../packages/core/src/community.js";
import { MessageService } from "../packages/core/src/messages.js";

const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-orgs-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["maya", "leo", "dani"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  const social = new SocialService(store);
  const identity = new IdentityService(
    social,
    renderMoment,
    () => new Date("2026-11-02T10:00:00Z"),
  );
  const orgs = new OrgService(social, identity, () => new Date("2026-11-02T10:00:00Z"));
  const community = new CommunityService(social, () => false);
  const messages = new MessageService(social, community, () => new Date("2026-11-02T10:00:00Z"));
  orgs.circles = messages;
  return { store, social, identity, orgs, messages };
}

test("a new term locks the last one; only the organisation's admin can start or lock terms", async () => {
  const { orgs } = await setup();
  // Teater Senja is run by Maya in the demo list.
  orgs.startTerm({ userId: "maya" }, "teater-senja", { label: "2025/26", from: 2025, to: 2026 });
  orgs.startTerm({ userId: "maya" }, "teater-senja", { label: "2026/27", from: 2026, to: 2027 });
  const terms = orgs.terms("teater-senja");
  assert.deepEqual(
    terms.map((t) => [t.label, t.locked]),
    [
      ["2026/27", false],
      ["2025/26", true],
    ],
  );
  assert.equal(orgs.publicPage("teater-senja").current, "2026/27");
  rejects(
    () => orgs.startTerm({ userId: "leo" }, "teater-senja", { label: "x/y", from: 2026 }),
    "ORG_ADMIN_REQUIRED",
  );
  rejects(
    () => orgs.startTerm({ userId: "maya" }, "teater-senja", { label: "2026/27", from: 2026 }),
    "TERM_EXISTS",
  );
  assert.throws(() =>
    orgs.startTerm({ userId: "maya" }, "teater-senja", { label: "bad", from: 2027, to: 2026 }),
  );
});

test("a handover moves the admin role without a password, and the outgoing admin keeps a chapter", async () => {
  const { orgs, identity } = await setup();
  orgs.startTerm({ userId: "maya" }, "teater-senja", { label: "2025/26", from: 2025, to: 2026 });
  const done = orgs.handover({ userId: "maya" }, "teater-senja", { handle: "@Leo", role: "Ketua" });
  assert.equal(done.admin.id, "leo");
  assert.deepEqual(identity.orgAdmins("teater-senja"), ["leo"]);
  assert.equal(done.chapter.label, "Ketua, Teater Senja 2025/26");
  assert.equal(done.chapter.from, 2025);
  // Maya no longer runs it; Leo does, and he can start the next term.
  rejects(() => orgs.manage({ userId: "maya" }, "teater-senja"), "ORG_ADMIN_REQUIRED");
  assert.equal(orgs.manage({ userId: "leo" }, "teater-senja").admins[0]?.handle, "leo");
  orgs.startTerm({ userId: "leo" }, "teater-senja", { label: "2026/27", from: 2026 });
  rejects(
    () => orgs.handover({ userId: "leo" }, "teater-senja", { handle: "leo" }),
    "HANDOVER_TO_SELF",
  );
  rejects(
    () => orgs.handover({ userId: "leo" }, "teater-senja", { handle: "nobody" }),
    "INVALID_USER",
  );
});

test("a post reads only the viewer's own memberships, and only when it declares org.read", async () => {
  const { orgs, social } = await setup();
  orgs.startTerm({ userId: "maya" }, "teater-senja", { label: "2025/26", from: 2025, to: 2026 });
  orgs.handover({ userId: "maya" }, "teater-senja", { handle: "leo" });
  const pkg = (capabilities: string[]) => ({
    package: {
      manifest: {
        schemaVersion: 2 as const,
        runtimeVersion: "web-v1" as const,
        name: "Presale",
        entrypoint: "index.html",
        capabilities,
        assets: [],
      },
      files: { "index.html": "<h1>Presale</h1>" },
    },
    metadata: { title: "Presale", format: "custom" as const, caption: "", contributors: [] },
  });
  const draft = social.createDraft({ userId: "leo" }, pkg(["org.read"]));
  const post = social.publish({ userId: "leo" }, draft.id, 1);
  const maya = social.capability({ userId: "maya" }, post.id, "org.read", undefined) as {
    memberships: { orgId: string; admin: boolean; roles: { label: string }[] }[];
  };
  assert.deepEqual(
    maya.memberships.map((m) => [m.orgId, m.admin, m.roles.map((r) => r.label)]),
    [["teater-senja", false, ["Admin, Teater Senja 2025/26"]]],
  );
  // Dani belongs nowhere, and nobody's chapters leak into his answer.
  const dani = social.capability({ userId: "dani" }, post.id, "org.read", undefined) as {
    memberships: unknown[];
  };
  assert.deepEqual(dani.memberships, []);
  const other = social.publish(
    { userId: "leo" },
    social.createDraft({ userId: "leo" }, pkg([])).id,
    1,
  );
  assert.throws(() => social.capability({ userId: "maya" }, other.id, "org.read", undefined));
});

test("anyone can start an organisation and run it; a join link hands out member chapters for the term", async () => {
  const { orgs, identity } = await setup();
  const org = orgs.createOrg(
    { userId: "dani" },
    { name: "Lembayung Design Society", term: "2026/27" },
  );
  assert.match(org.id, /^lembayung-design-society/);
  assert.equal(org.current, "2026/27");
  assert.deepEqual(identity.orgAdmins(org.id), ["dani"]);
  // The same name again gets its own address instead of taking over the first.
  const twin = orgs.createOrg({ userId: "leo" }, { name: "Lembayung Design Society" });
  assert.notEqual(twin.id, org.id);

  const { code } = orgs.joinLink({ userId: "dani" }, org.id);
  assert.equal(orgs.joinLink({ userId: "dani" }, org.id).code, code, "one link per term");
  rejects(() => orgs.joinLink({ userId: "maya" }, org.id), "ORG_ADMIN_REQUIRED");
  assert.equal(orgs.joinPreview(org.id, code).label, "Member, Lembayung Design Society 2026/27");
  rejects(() => orgs.joinPreview("teater-senja", code), "INVITE_INVALID");

  const chapter = identity.redeemInvite({ userId: "maya" }, { code });
  assert.equal(chapter.orgId, org.id);
  assert.equal(chapter.from, 2026);
  assert.equal(orgs.publicPage(org.id).members, 1);
  // A new term means a new link, so next year's members get next year's chapter.
  orgs.startTerm({ userId: "dani" }, org.id, { label: "2027/28", from: 2027 });
  assert.notEqual(orgs.joinLink({ userId: "dani" }, org.id).code, code);

  orgs.createOrg({ userId: "dani" }, { name: "Second club" });
  orgs.createOrg({ userId: "dani" }, { name: "Third club" });
  rejects(() => orgs.createOrg({ userId: "dani" }, { name: "Fourth club" }), "TOO_MANY_ORGS");
});

test("a term's room: members only, state and announcements by admins, and a locked term is read only", async () => {
  const { orgs, identity } = await setup();
  const org = orgs.createOrg({ userId: "dani" }, { name: "Room test club", term: "2026/27" });
  const [term] = orgs.terms(org.id);
  const { code } = orgs.joinLink({ userId: "dani" }, org.id);
  identity.redeemInvite({ userId: "maya" }, { code });

  // Leo never joined: no room for him, and nothing leaks.
  assert.deepEqual(orgs.rooms({ userId: "leo" }, org.id), []);
  rejects(() => orgs.room({ userId: "leo" }, org.id, term!.id), "NOT_A_MEMBER");
  rejects(() => orgs.post({ userId: "leo" }, org.id, term!.id, { text: "hi" }), "NOT_A_MEMBER");

  orgs.setState({ userId: "dani" }, org.id, term!.id, {
    kind: "deadline",
    text: "CVs due",
    when: "2026-11-10",
  });
  rejects(
    () => orgs.setState({ userId: "maya" }, org.id, term!.id, { kind: "decision", text: "Mine" }),
    "ORG_ADMIN_REQUIRED",
  );
  orgs.post({ userId: "dani" }, org.id, term!.id, {
    kind: "announcement",
    text: "Meeting Thursday",
  });
  rejects(
    () => orgs.post({ userId: "maya" }, org.id, term!.id, { kind: "announcement", text: "x" }),
    "ORG_ADMIN_REQUIRED",
  );
  orgs.post({ userId: "maya" }, org.id, term!.id, { text: "On it" });
  const room = orgs.room({ userId: "maya" }, org.id, term!.id);
  assert.equal(room.admin, false);
  assert.deepEqual(
    room.state.map((s) => s.text),
    ["CVs due"],
  );
  assert.deepEqual(
    room.announcements.map((a) => a.text),
    ["Meeting Thursday"],
  );
  assert.deepEqual(
    room.messages.map((m) => [m.author.id, m.text]),
    [["maya", "On it"]],
  );

  // Next term: Maya's chapter was for 2026/27, so she still reads that room but can't add to it,
  // and the new term's room isn't hers until she joins again.
  orgs.startTerm({ userId: "dani" }, org.id, { label: "2027/28", from: 2027 });
  assert.deepEqual(
    orgs.rooms({ userId: "maya" }, org.id).map((r) => [r.label, r.locked]),
    [["2026/27", true]],
  );
  assert.equal(orgs.room({ userId: "maya" }, org.id, term!.id).canPost, false);
  rejects(() => orgs.post({ userId: "maya" }, org.id, term!.id, { text: "late" }), "TERM_LOCKED");
  assert.equal(orgs.rooms({ userId: "dani" }, org.id).length, 2);
});

test("the page lists each term's company from public chapters, titles first; the room knows your role", async () => {
  const { orgs, store } = await setup();
  const org = orgs.createOrg({ userId: "dani" }, { name: "Company test club", term: "2026/27" });
  const [term] = orgs.terms(org.id);
  const chapter = (id: string, ownerId: string, kind: string, label: string, audience: string) =>
    store.put("chapter", id, {
      id,
      ownerId,
      kind,
      label,
      orgId: org.id,
      from: 2026,
      to: 2027,
      method: "invite",
      audience,
      createdAt: `2026-11-0${id.length % 9}T00:00:00Z`,
    });
  store.transaction(() => {
    chapter("c1", "maya", "member", "Member, Company test club 2026/27", "public");
    chapter("c22", "leo", "title", "Director, Company test club 2026/27", "public");
    chapter("c333", "maya", "title", "Stage manager, Company test club 2026/27", "circle");
  });
  const page = orgs.publicPage(org.id);
  assert.equal(page.since, 2026);
  // Leo's title comes first; Maya shows as a member, since her stage manager title isn't public.
  assert.deepEqual(
    page.company[0]!.people.map((p) => [p.id, p.role]),
    [
      ["leo", "Director"],
      ["maya", "Member"],
    ],
  );
  // In the room, Maya sees her own title whatever its audience; the admin without one is Admin.
  assert.equal(orgs.room({ userId: "maya" }, org.id, term!.id).you.role, "Stage manager");
  assert.equal(orgs.room({ userId: "dani" }, org.id, term!.id).you.role, "Admin");
});

test("an organisation picks its own look, colour and words; only its admin can, and anyone sees it", async () => {
  const { orgs } = await setup();
  assert.deepEqual(orgs.publicPage("teater-senja").look, { look: "playbill" });
  rejects(
    () => orgs.setLook({ userId: "leo" }, "teater-senja", { look: "matchday" }),
    "ORG_ADMIN_REQUIRED",
  );
  orgs.setLook({ userId: "maya" }, "teater-senja", {
    look: "noticeboard",
    accent: "#FF0066",
    inside: "Sekre",
    company: "Pengurus",
  });
  assert.deepEqual(orgs.publicPage("teater-senja").look, {
    look: "noticeboard",
    accent: "#ff0066",
    inside: "Sekre",
    company: "Pengurus",
  });
  // Leaving a word out goes back to the look's own.
  orgs.setLook({ userId: "maya" }, "teater-senja", { look: "matchday" });
  assert.deepEqual(orgs.publicPage("teater-senja").look, { look: "matchday" });
  // A colour is a colour, not CSS, and looks come from the list.
  for (const bad of [
    { look: "matchday", accent: "red; background:url(x)" },
    { look: "vaporwave" },
    { look: "matchday", inside: "x".repeat(21) },
    { look: "matchday", css: "body{}" },
  ])
    assert.throws(() => orgs.setLook({ userId: "maya" }, "teater-senja", bad));
});

test("a finished term's talk stays with its people, who may keep going as a circle of their own", async () => {
  const { orgs, identity, messages } = await setup();
  const org = orgs.createOrg({ userId: "dani" }, { name: "Makrab Committee", term: "2026/27" });
  const term = orgs.terms(org.id)[0]!;
  identity.redeemInvite({ userId: "maya" }, orgs.joinLink({ userId: "dani" }, org.id));
  orgs.post({ userId: "maya" }, org.id, term.id, { text: "See you at the venue" });
  orgs.post({ userId: "dani" }, org.id, term.id, { kind: "announcement", text: "Thanks all" });
  // While it's open there's nothing to keep going yet.
  assert.equal(orgs.room({ userId: "maya" }, org.id, term.id).circle, null);
  rejects(
    () => orgs.startCircle({ userId: "maya" }, org.id, term.id, { name: "Makrab crew" }),
    "TERM_STILL_OPEN",
  );

  // The term ends and Leo, who was never in it, takes over the organisation.
  orgs.startTerm({ userId: "dani" }, org.id, { label: "2027/28", from: 2027 });
  orgs.handover({ userId: "dani" }, org.id, { handle: "leo" });
  const asLeo = orgs.room({ userId: "leo" }, org.id, term.id);
  assert.equal(asLeo.talk, false);
  assert.deepEqual(asLeo.messages, [], "the next committee doesn't read the old talk");
  assert.deepEqual(
    asLeo.announcements.map((a) => a.text),
    ["Thanks all"],
  );
  assert.equal(asLeo.circle, null);
  rejects(
    () => orgs.startCircle({ userId: "leo" }, org.id, term.id, { name: "Mine" }),
    "NOT_A_MEMBER",
  );
  const asMaya = orgs.room({ userId: "maya" }, org.id, term.id);
  assert.equal(asMaya.talk, true);
  assert.deepEqual(asMaya.circle, { name: null });

  // Maya keeps it going; nobody is added, Dani joins by choice, Leo can't.
  const { groupId } = orgs.startCircle({ userId: "maya" }, org.id, term.id, {
    name: "Makrab crew",
  });
  assert.deepEqual(messages.circleMembers(groupId), ["maya"]);
  assert.deepEqual(orgs.room({ userId: "dani" }, org.id, term.id).circle, {
    name: "Makrab crew",
    groupId,
    people: 1,
    joined: false,
    startedBy: "maya",
  });
  orgs.joinCircle({ userId: "dani" }, org.id, term.id);
  rejects(() => orgs.joinCircle({ userId: "leo" }, org.id, term.id), "NOT_A_MEMBER");
  assert.deepEqual(messages.circleMembers(groupId), ["maya", "dani"]);
  // A second start joins the circle that's there instead of making another.
  assert.equal(
    orgs.startCircle({ userId: "dani" }, org.id, term.id, { name: "Other" }).groupId,
    groupId,
  );
  // It's an ordinary group chat now, outside the organisation.
  messages.sendToGroup({ userId: "dani" }, groupId, { text: "Reunion?" });
  assert.deepEqual(
    messages.groupThread({ userId: "maya" }, groupId).messages.map((m) => m.text),
    ["Reunion?"],
  );
  rejects(() => messages.groupThread({ userId: "leo" }, groupId), "NOT_FOUND");
});

test("a private organisation is there only for its own people; a join link still opens it", async () => {
  const { orgs, identity } = await setup();
  const org = orgs.createOrg({ userId: "dani" }, { name: "Quiet club", term: "2026/27" });
  const { code } = orgs.joinLink({ userId: "dani" }, org.id);
  const joined = identity.redeemInvite({ userId: "maya" }, { code });
  identity.setChapterAudience({ userId: "maya" }, joined.id, { audience: "public" });
  assert.equal(orgs.publicPage(org.id).visibility, "public");
  rejects(
    () => orgs.setVisibility({ userId: "maya" }, org.id, { visibility: "private" }),
    "ORG_ADMIN_REQUIRED",
  );
  orgs.setVisibility({ userId: "dani" }, org.id, { visibility: "private" });
  rejects(() => orgs.publicPage(org.id), "NOT_FOUND");
  rejects(() => orgs.publicPage(org.id, "leo"), "NOT_FOUND");
  assert.equal(orgs.publicPage(org.id, "maya").members, 1);
  assert.equal(orgs.canSee(org.id, "leo"), false);
  // Someone holding a join link sees just enough to join, and no people.
  const fresh = orgs.joinLink({ userId: "dani" }, org.id).code;
  const stub = orgs.publicPage(org.id, "leo", fresh);
  assert.equal(stub.name, "Quiet club");
  assert.deepEqual(stub.company, []);
  // Maya's member chapter is public on her page, but Leo, outside the club, doesn't see it.
  assert.equal(
    identity.chaptersFor({ userId: "leo" }, "maya").some((c) => c.orgId === org.id),
    false,
  );
  assert.equal(
    identity.chaptersFor({ userId: "maya" }, "maya").some((c) => c.orgId === org.id),
    true,
  );
  // Link only: anyone can open it, it just stays out of search.
  orgs.setVisibility({ userId: "dani" }, org.id, { visibility: "link" });
  assert.equal(orgs.publicPage(org.id).visibility, "link");
  assert.equal(
    identity.chaptersFor({ userId: "leo" }, "maya").some((c) => c.orgId === org.id),
    true,
  );
});

test("each title has a line: the people who held it, numbered from the first", async () => {
  const { orgs, store, identity } = await setup();
  const org = orgs.createOrg({ userId: "dani" }, { name: "Line club", term: "2026/27" });
  const title = (id: string, ownerId: string, label: string, from: number, audience = "public") =>
    store.put("chapter", id, {
      id,
      ownerId,
      kind: "title",
      label,
      orgId: org.id,
      from,
      to: from + 1,
      method: "invite",
      audience,
      createdAt: `${from}-09-01T00:00:00Z`,
    });
  store.transaction(() => {
    title("t2", "leo", "Head of Comms, Line club 2025/26", 2025);
    title("t1", "dani", "Head of Comms, Line club 2024/25", 2024);
    title("t3", "maya", "Head of Comms, Line club 2026/27", 2026, "circle");
    title("t4", "maya", "Treasurer, Line club 2026/27", 2026);
  });
  const lines = orgs.publicPage(org.id).lines;
  const comms = lines.find((l) => l.role === "Head of Comms")!;
  // Maya's own comms title is close circle only, so the public line skips her but keeps the count.
  assert.deepEqual(
    comms.holders.map((h) => [h.id, h.n]),
    [
      ["dani", 1],
      ["leo", 2],
    ],
  );
  assert.deepEqual(
    identity
      .chaptersFor({ userId: "maya" }, "maya")
      .filter((c) => c.kind === "title")
      .map((c) => c.line),
    [
      { n: 3, role: "Head of Comms" },
      { n: 1, role: "Treasurer" },
    ],
  );
});

test("an event's crew stamp goes to the organisation's own people, once each", async () => {
  const { orgs, identity } = await setup();
  const org = orgs.createOrg({ userId: "dani" }, { name: "Crew club", term: "2026/27" });
  identity.redeemInvite({ userId: "maya" }, orgs.joinLink({ userId: "dani" }, org.id));
  assert.deepEqual(orgs.events(org.id), { collection: null, events: [] });
  rejects(
    () => orgs.createEvent({ userId: "maya" }, org.id, { name: "Spring Show" }),
    "ORG_ADMIN_REQUIRED",
  );
  const { stamp } = orgs.createEvent({ userId: "dani" }, org.id, { name: "Spring Show" });
  const again = orgs.createEvent({ userId: "dani" }, org.id, { name: "Spring Show" });
  assert.notEqual(again.stamp.id, stamp.id);
  const result = orgs.awardCrew({ userId: "dani" }, org.id, stamp.id, {
    handles: ["@maya", "leo", "nobody", "MAYA"],
  });
  assert.deepEqual(result.awarded, ["maya"]);
  assert.deepEqual(
    result.skipped.map((s) => [s.handle, s.why]),
    [
      ["leo", "not-a-member"],
      ["nobody", "unknown"],
    ],
  );
  assert.deepEqual(
    orgs.awardCrew({ userId: "dani" }, org.id, stamp.id, { handles: ["maya"] }).skipped,
    [{ handle: "maya", why: "already" }],
  );
  const held = identity
    .chaptersFor({ userId: "maya" }, "maya")
    .filter((c) => c.kind === "stamp" && c.orgId === org.id);
  assert.deepEqual(
    held.map((c) => [c.label, c.from]),
    [["Crew, Spring Show", 2026]],
  );
  assert.equal(orgs.events(org.id).events.find((e) => e.id === stamp.id)?.crew, 1);
  assert.equal(orgs.publicPage(org.id).collections[0]?.stamps, 2);
  rejects(
    () => orgs.awardCrew({ userId: "dani" }, org.id, "nope", { handles: ["maya"] }),
    "NOT_FOUND",
  );
});

test("members draft posts for the organisation; only what an admin approves goes on the page", async () => {
  const { orgs, identity } = await setup();
  const org = orgs.createOrg({ userId: "dani" }, { name: "Post club", term: "2026/27" });
  identity.redeemInvite({ userId: "maya" }, orgs.joinLink({ userId: "dani" }, org.id));
  rejects(() => orgs.submitPost({ userId: "leo" }, org.id, { text: "Hello" }), "NOT_A_MEMBER");
  rejects(() => orgs.posts({ userId: "leo" }, org.id), "NOT_A_MEMBER");
  const draft = orgs.submitPost({ userId: "maya" }, org.id, { text: "Auditions open Friday" });
  assert.equal(draft.status, "pending");
  assert.deepEqual(orgs.publicPage(org.id).posts, []);
  rejects(
    () => orgs.reviewPost({ userId: "maya" }, org.id, draft.id, { approve: true }),
    "ORG_ADMIN_REQUIRED",
  );
  assert.equal(orgs.posts({ userId: "dani" }, org.id).pending.length, 1);
  orgs.reviewPost({ userId: "dani" }, org.id, draft.id, { approve: true });
  rejects(
    () => orgs.reviewPost({ userId: "dani" }, org.id, draft.id, { approve: false }),
    "POST_NOT_PENDING",
  );
  const declined = orgs.submitPost({ userId: "maya" }, org.id, { text: "Free pizza for all" });
  orgs.reviewPost({ userId: "dani" }, org.id, declined.id, { approve: false });
  // The admin's own post goes out at once.
  assert.equal(
    orgs.submitPost({ userId: "dani" }, org.id, { text: "Welcome, new term" }).status,
    "published",
  );
  const page = orgs.publicPage(org.id);
  assert.deepEqual(page.posts.map((p) => p.text).sort(), [
    "Auditions open Friday",
    "Welcome, new term",
  ]);
  // The page speaks as the organisation; who drafted it stays inside.
  assert.equal("authorId" in page.posts[0]!, false);
  assert.equal(orgs.posts({ userId: "maya" }, org.id).pending.length, 0);
});
