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

test("an oprec: apply with your profile, the committee decides, accepted means a chapter and the room", async () => {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-oprec-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["maya", "leo", "dani", "ines"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  const now = () => new Date("2026-11-02T10:00:00Z");
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment, now);
  const orgs = new OrgService(social, identity, now);
  const oprecs = new OprecService(social, identity, orgs, now);
  const org = orgs.createOrg({ userId: "dani" }, { name: "Oprec test club", term: "2026/27" });
  const [term] = orgs.terms(org.id);
  const input = {
    title: "Orientation Week Crew",
    roles: ["Events", "Comms"],
    questions: ["Why do you want to join?"],
    closes: "2026-11-16",
  };
  rejects(() => oprecs.create({ userId: "leo" }, org.id, input), "ORG_ADMIN_REQUIRED");
  rejects(
    () => oprecs.create({ userId: "dani" }, org.id, { ...input, closes: "2026-11-01" }),
    "OPREC_CLOSES_IN_PAST",
  );
  const oprec = oprecs.create({ userId: "dani" }, org.id, input);
  rejects(() => oprecs.create({ userId: "dani" }, org.id, input), "OPREC_ALREADY_OPEN");
  assert.equal(oprecs.current(org.id)?.term, "2026/27");

  identity.grantChapter({
    ownerId: "maya",
    kind: "title",
    label: "Chair, Campus Festival 2025",
    from: 2025,
    method: "invite",
    audience: "public",
  });
  const app = oprecs.apply({ userId: "maya" }, org.id, oprec.id, {
    role: "events",
    answers: ["I ran events before"],
  });
  assert.equal(app.role, "Events", "the division is named the organisation's way");
  rejects(
    () => oprecs.apply({ userId: "maya" }, org.id, oprec.id, { role: "Comms" }),
    "ALREADY_APPLIED",
  );
  rejects(
    () => oprecs.apply({ userId: "leo" }, org.id, oprec.id, { role: "Kitchen" }),
    "ROLE_UNKNOWN",
  );
  const leo = oprecs.apply({ userId: "leo" }, org.id, oprec.id, { role: "Comms" });
  assert.equal(oprecs.current(org.id)?.applicants, 2);

  // The committee sees what each applicant has proven, without them filling it in again.
  rejects(() => oprecs.list({ userId: "maya" }, org.id, oprec.id), "ORG_ADMIN_REQUIRED");
  const list = oprecs.list({ userId: "dani" }, org.id, oprec.id);
  assert.deepEqual(list.applications.find((a) => a.userId === "maya")?.proven, [
    "Chair, Campus Festival 2025",
  ]);

  const accepted = oprecs.decide({ userId: "dani" }, org.id, oprec.id, app.id, { accept: true });
  assert.equal(accepted.chapter?.label, "Events, Oprec test club 2026/27");
  assert.equal(accepted.chapter?.from, 2026);
  rejects(
    () => oprecs.decide({ userId: "dani" }, org.id, oprec.id, app.id, { accept: false }),
    "ALREADY_DECIDED",
  );
  oprecs.decide({ userId: "dani" }, org.id, oprec.id, leo.id, { accept: false });
  assert.deepEqual(oprecs.mine({ userId: "leo" }, org.id, oprec.id), {
    role: "Comms",
    status: "declined",
  });
  // Accepted opens the term's room; declined doesn't.
  assert.deepEqual(
    orgs.rooms({ userId: "maya" }, org.id).map((r) => r.id),
    [term!.id],
  );
  assert.deepEqual(orgs.rooms({ userId: "leo" }, org.id), []);

  oprecs.close({ userId: "dani" }, org.id, oprec.id);
  assert.equal(oprecs.current(org.id), null);
  rejects(
    () => oprecs.apply({ userId: "ines" }, org.id, oprec.id, { role: "Events" }),
    "OPREC_CLOSED",
  );
});
