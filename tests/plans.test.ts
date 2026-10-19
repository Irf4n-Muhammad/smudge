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
type View = { count: number; going: boolean; people: { name: string }[] };

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
  assert.deepEqual(read(bob), { count: 0, going: false, people: [] });
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
    going: false,
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
