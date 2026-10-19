import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { PlansService } from "../packages/core/src/plans.js";
import { buildPost, startPostDesign } from "../packages/core/src/easy-post.js";
import { experienceSchema } from "../packages/contracts/src/experience.js";

const alice = { userId: "alice" },
  bob = { userId: "bob" },
  cara = { userId: "cara" };

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-plans-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["alice", "bob", "cara"])
      store.put("user", id, {
        id,
        name: id[0]!.toUpperCase() + id.slice(1),
        handle: id,
        initials: id[0]!.toUpperCase(),
        color: "#eee",
      });
  });
  const social = new SocialService(store);
  const plans = new PlansService(social);
  const built = buildPost(startPostDesign("plan"));
  const draft = social.createDraft(alice, {
    package: built.package,
    metadata: { ...built.metadata, caption: "", contributors: [] },
  });
  const post = social.publish(alice, draft.id, draft.revision);
  return { store, social, plans, post, draft };
}
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);
type View = {
  count: number;
  cameCount: number;
  going: boolean;
  came: boolean;
  people: { name: string; came: boolean }[];
};

test("a plan post declares its permissions and is a valid v2 package", async () => {
  const { post } = await setup();
  assert.deepEqual(post.package.manifest.capabilities, ["plan.read", "plan.join"]);
  assert.equal(experienceSchema.safeParse(post.package).success, true);
  assert.match(post.package.files["index.html"]!, /plan\.js/);
  assert.match(post.package.files["plan.js"]!, /forma\.plan\.join/);
  // An ordinary style carries no permissions and no plan script.
  const plain = buildPost(startPostDesign("poster"));
  assert.deepEqual(plain.package.manifest.capabilities, []);
  assert.equal("plan.js" in plain.package.files, false);
});

test("people join and leave with one tap each, and everyone sees the same list", async () => {
  const { social, plans, post } = await setup();
  const read = (actor: { userId: string }) =>
    social.capability(actor, post.id, "plan.read", undefined) as View;
  assert.deepEqual(read(bob), { count: 0, cameCount: 0, going: false, came: false, people: [] });
  const joined = social.capability(bob, post.id, "plan.join", { going: true }) as View;
  assert.equal(joined.going, true);
  assert.equal(joined.count, 1);
  social.capability(cara, post.id, "plan.join", { going: true });
  // Joining twice is still one place.
  social.capability(cara, post.id, "plan.join", { going: true });
  const alices = read(alice);
  assert.equal(alices.count, 2);
  assert.equal(alices.going, false);
  assert.deepEqual(
    alices.people.map((p) => p.name),
    ["Cara", "Bob"],
  );
  const left = social.capability(cara, post.id, "plan.join", { going: false }) as View;
  assert.deepEqual({ count: left.count, going: left.going }, { count: 1, going: false });
  assert.throws(() => social.capability(bob, post.id, "plan.join", { going: "yes" }));
  // People the viewer cannot see are counted but not named.
  plans.peopleFilter = (viewer, user) => !(viewer === "alice" && user === "bob");
  assert.equal(read(alice).people.length, 0);
  assert.equal(read(alice).count, 1);
  assert.equal(read(cara).people.length, 1);
});

test("the permission is the post's to declare; previews are read-only; deletion clears the list", async () => {
  const { social, plans, post, draft, store } = await setup();
  const poster = buildPost(startPostDesign("poster"));
  const other = social.createDraft(alice, {
    package: poster.package,
    metadata: { ...poster.metadata, caption: "", contributors: [] },
  });
  const plain = social.publish(alice, other.id, other.revision);
  rejects(
    () => social.capability(bob, plain.id, "plan.join", { going: true }),
    "CAPABILITY_DENIED",
  );
  // The owner's own preview answers an empty practice list and refuses to record anything.
  assert.deepEqual(social.capability(alice, draft.id, "plan.read", undefined, true), {
    count: 0,
    cameCount: 0,
    going: false,
    came: false,
    people: [],
  });
  rejects(
    () => social.capability(alice, draft.id, "plan.join", { going: true }, true),
    "PREVIEW_READ_ONLY",
  );
  social.capability(bob, post.id, "plan.join", { going: true });
  assert.equal(plans.of(bob, post.id).count, 1);
  social.deletePost(alice, post.id);
  assert.equal(store.ids("rsvp").length, 0);
});

test("who actually came is kept next to who was in, and leaving drops both", async () => {
  const { social, post } = await setup();
  const call = (actor: { userId: string }, payload: unknown) =>
    social.capability(actor, post.id, "plan.join", payload) as View;
  social.capability(bob, post.id, "plan.join", { going: true });
  social.capability(cara, post.id, "plan.join", { going: true });
  // Saying you were there implies you were in; saying it twice is still one person.
  const there = call(cara, { came: true });
  assert.deepEqual(
    { count: there.count, cameCount: there.cameCount, going: there.going, came: there.came },
    { count: 2, cameCount: 1, going: true, came: true },
  );
  call(cara, { came: true });
  assert.equal(call(alice, { came: true }).cameCount, 2);
  assert.equal(call(alice, { came: true }).count, 3);
  const seen = social.capability(bob, post.id, "plan.read", undefined) as View;
  assert.deepEqual(
    seen.people.map((p) => [p.name, p.came]),
    [
      ["Alice", true],
      ["Cara", true],
      ["Bob", false],
    ],
  );
  // Taking it back keeps the place; leaving drops the record entirely.
  assert.equal(call(cara, { came: false }).cameCount, 1);
  assert.equal(call(cara, { going: false }).count, 2);
  assert.throws(() => call(bob, {}));
  assert.throws(() => call(bob, { came: "yes" }));
});

test("a side lists its plans for the side's home, newest first, only those the viewer may open", async () => {
  const { social, plans, post } = await setup();
  // The practice plan from setup lives in Everyday; a second one goes into Runners.
  const built = buildPost(startPostDesign("plan", { headline: "Track night" }));
  const draft = social.createDraft(bob, {
    package: built.package,
    metadata: { ...built.metadata, caption: "Thursday", contributors: [], side: "runners" },
  });
  const track = social.publish(bob, draft.id, draft.revision);
  plans.join(cara, track.id, { going: true });
  plans.join(cara, track.id, { came: true });
  const listed = plans.inSide(alice, "runners");
  assert.deepEqual(
    listed.map((p) => [p.postId, p.title, p.caption, p.ownerName, p.count, p.cameCount, p.going]),
    [[track.id, "Track night", "Thursday", "Bob", 1, 1, false]],
  );
  assert.deepEqual(
    plans.inSide(alice, "everyday").map((p) => p.postId),
    [post.id],
  );
  // A post the viewer may not see is not listed.
  social.viewFilter = (viewerId, p) => !(viewerId === "alice" && p.id === track.id);
  assert.deepEqual(plans.inSide(alice, "runners"), []);
  assert.equal(plans.inSide(bob, "runners").length, 1);
});

test("a side's regulars: who came most often across its plans, as the viewer may see them", async () => {
  const { social, plans } = await setup();
  const plan = (headline: string) => {
    const built = buildPost(startPostDesign("plan", { headline }));
    const draft = social.createDraft(bob, {
      package: built.package,
      metadata: { ...built.metadata, caption: "", contributors: [], side: "runners" },
    });
    return social.publish(bob, draft.id, draft.revision);
  };
  const tempo = plan("Tempo Tuesday");
  const long = plan("Sunday long run");
  const hills = plan("Hills");
  // Cara came three times; Alice was in three plans but came once; Bob was in one and never came.
  for (const p of [tempo, long, hills]) {
    plans.join(cara, p.id, { came: true });
    plans.join(alice, p.id, { going: true });
  }
  plans.join(alice, long.id, { came: true });
  plans.join(bob, tempo.id, { going: true });
  assert.deepEqual(
    plans.regulars(alice, "runners").map((r) => [r.name, r.plans, r.came]),
    [
      ["Cara", 3, 3],
      ["Alice", 3, 1],
    ],
  );
  // The practice plan in Everyday counts for Everyday only; a side with no plans has no regulars.
  assert.deepEqual(plans.regulars(alice, "everyday"), []);
  assert.deepEqual(plans.regulars(alice, "gamers"), []);
  // A plan the viewer may not open is not counted; a person the viewer may not see is not listed.
  social.viewFilter = (viewerId, p) => !(viewerId === "alice" && p.id === long.id);
  assert.deepEqual(
    plans.regulars(alice, "runners").map((r) => [r.name, r.came]),
    [["Cara", 2]],
  );
  plans.peopleFilter = (viewerId, userId) => !(viewerId === "bob" && userId === "cara");
  assert.deepEqual(
    plans.regulars(bob, "runners").map((r) => r.name),
    ["Alice"],
  );
  assert.equal(plans.regulars(bob, "runners", 0).length, 0);
});
