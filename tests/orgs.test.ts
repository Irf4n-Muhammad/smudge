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
  return { store, social, identity, orgs };
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
