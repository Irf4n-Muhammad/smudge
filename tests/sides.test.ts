import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { SidesService } from "../packages/core/src/sides.js";
import { GUEST } from "../packages/core/src/social.js";
import { SharingService } from "../packages/core/src/sharing.js";
import { CommunityService } from "../packages/core/src/community.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import { renderMoment } from "../apps/server/moments.js";
import { simplePost } from "./fixtures.js";

const alice = { userId: "alice" },
  bob = { userId: "bob" },
  leo = { userId: "leo" };

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-sides-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["alice", "bob", "leo"])
      store.put("user", id, { id, name: id[0]!.toUpperCase() + id.slice(1), handle: id });
  });
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment);
  const sides = new SidesService(social);
  identity.chapterListeners.push((c) => sides.joinByChapter(c));
  const post = (actor: { userId: string }, title: string, side?: string) => {
    const draft = social.createDraft(actor, {
      package: simplePost(),
      metadata: {
        title,
        caption: "",
        format: "custom",
        contributors: [],
        ...(side ? { side } : {}),
      },
    });
    return social.publish(actor, draft.id, draft.revision);
  };
  const titles = (actor: { userId: string }) => social.feed(actor).map((p) => p.metadata.title);
  return { store, social, identity, sides, post, titles };
}
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

test("everyone is in Everyday; open sides are joined with a tap and left again", async () => {
  const { sides } = await setup();
  assert.deepEqual(
    sides.me(alice).mine.map((s) => s.id),
    ["everyday"],
  );
  assert.deepEqual(
    sides.me(alice).open.map((s) => s.id),
    ["runners", "gamers"],
  );
  sides.join(alice, "runners");
  assert.deepEqual(
    sides.me(alice).mine.map((s) => s.id),
    ["everyday", "runners"],
  );
  assert.deepEqual(
    sides.me(alice).open.map((s) => s.id),
    ["gamers"],
  );
  sides.setActive(alice, { side: "runners" });
  assert.equal(sides.me(alice).active, "runners");
  // Leaving a side drops you back into Everyday; Everyday itself cannot be left.
  sides.leave(alice, "runners");
  assert.equal(sides.me(alice).active, "everyday");
  rejects(() => sides.leave(alice, "everyday"), "SIDE_REQUIRED");
  rejects(() => sides.setActive(alice, { side: "runners" }), "NOT_FOUND");
  rejects(() => sides.join(alice, "no-such-side"), "NOT_FOUND");
});

test("a post lives in one side: listed there, open by its link, and absent from Everyday", async () => {
  const { sides, post, titles, social } = await setup();
  sides.join(alice, "runners");
  sides.join(bob, "runners");
  post(alice, "Sunday long run", "runners");
  post(alice, "Breakfast");
  // Alice's active side is still Everyday.
  assert.deepEqual(titles(alice), ["Breakfast"]);
  sides.setActive(alice, { side: "runners" });
  assert.deepEqual(titles(alice), ["Sunday long run"]);
  // Bob is in Runners but browsing Everyday: the run is not pushed to him there.
  assert.deepEqual(titles(bob), ["Breakfast"]);
  // Leo is not in Runners at all; the post is still public, so its link opens.
  const run = social.feed(alice)[0]!;
  assert.equal(social.visiblePost(leo, run.id).metadata.title, "Sunday long run");
  assert.deepEqual(titles(leo), ["Breakfast"]);
  // The mixed layout puts every side you are in into one feed.
  sides.setLayout(bob, { layout: "mixed" });
  assert.deepEqual(titles(bob), ["Breakfast", "Sunday long run"]);
  // Leaving a side takes its posts out of your mixed feed too.
  sides.leave(bob, "runners");
  assert.deepEqual(titles(bob), ["Breakfast"]);
});

test("the writer shares a post to Everyday, and only the writer", async () => {
  const { sides, post, titles, social } = await setup();
  sides.join(alice, "runners");
  const run = post(alice, "Race day", "runners");
  rejects(() => sides.share(bob, run.id, { everyday: true }), "FORBIDDEN");
  sides.share(alice, run.id, { everyday: true });
  assert.deepEqual(titles(bob), ["Race day"]);
  assert.equal(social.feed(bob)[0]!.metadata.side, "runners");
  assert.deepEqual(sides.tag(run), {
    side: { id: "runners", name: "Runners", accent: "#e07a1f" },
    shared: true,
  });
  sides.share(alice, run.id, { everyday: false });
  assert.deepEqual(titles(bob), []);
  const plain = post(alice, "Breakfast");
  rejects(() => sides.share(alice, plain.id, { everyday: true }), "SIDE_ALREADY_EVERYDAY");
  assert.deepEqual(sides.tag(plain), {});
});

test("publishing into a side needs membership, and remix lands in Everyday", async () => {
  const { sides, post } = await setup();
  rejects(() => post(alice, "Sneaking in", "runners"), "SIDE_NOT_JOINED");
  rejects(() => post(alice, "Nowhere", "mars"), "SIDE_UNKNOWN");
  sides.join(alice, "runners");
  assert.equal(post(alice, "Now a runner", "runners").metadata.side, "runners");
  // A member who leaves keeps the post in the side; it is not moved or deleted.
  sides.leave(alice, "runners");
  sides.join(bob, "runners");
  sides.setActive(bob, { side: "runners" });
  assert.deepEqual(
    sides.me(bob).mine.map((s) => s.id),
    ["everyday", "runners"],
  );
});

test("a private side is invisible from outside and opens with the organisation's invite", async () => {
  const { sides, identity, post, titles, social } = await setup();
  // Leo administers the festival; its side is private and not on anyone's open list.
  rejects(() => sides.join(alice, "film-fest"), "NOT_FOUND");
  assert.ok(!sides.me(alice).open.some((s) => s.id === "film-fest"));
  const invite = identity.createInvite(leo, {
    orgId: "film-fest",
    kind: "member",
    label: "Jury, Lembayung Film Festival 2026",
    period: { from: 2026 },
    uses: 5,
  });
  identity.redeemInvite(leo, { code: invite.code, audience: "public" });
  sides.setActive(leo, { side: "film-fest" });
  const notes = post(leo, "Jury notes", "film-fest");
  // Not a member: the post does not open, is not listed, and is not found by search.
  rejects(() => social.visiblePost(alice, notes.id), "NOT_FOUND");
  assert.deepEqual(titles(alice), []);
  assert.equal(social.explore(alice, "jury").length, 0);
  // The invite code lets Bob in; the chapter and the side arrive together.
  identity.redeemInvite(bob, { code: invite.code, audience: "circle" });
  assert.ok(sides.me(bob).mine.some((s) => s.id === "film-fest"));
  sides.setActive(bob, { side: "film-fest" });
  assert.deepEqual(titles(bob), ["Jury notes"]);
  // Shared to Everyday, the writer has decided it is for everyone.
  sides.share(leo, notes.id, { everyday: true });
  assert.deepEqual(titles(alice), ["Jury notes"]);
});

test("the view filter answers for a person alone, as the theme lookup asks it", async () => {
  const { social } = await setup();
  // IdentityService.themeFor probes with `{id: "", ownerId}` and no metadata.
  assert.equal(social.viewFilter("bob", { id: "", ownerId: "alice" } as never), true);
});

test("a side's home counts everyone, shows the people the viewer may see, and keeps private sides to members", async () => {
  const { sides, post, social } = await setup();
  sides.join(alice, "runners");
  sides.join(bob, "runners");
  post(alice, "Sunday long run", "runners");
  post(alice, "Breakfast");
  // Leo is not in Runners, but it is an open side: he sees who is in and what is posted.
  const outside = sides.home(leo, "runners");
  assert.equal(outside.member, false);
  assert.equal(outside.since, undefined);
  assert.equal(outside.members.count, 2);
  assert.deepEqual(
    outside.members.people.map((p) => p.id),
    ["bob", "alice"],
  );
  assert.equal(outside.posts, 1);
  assert.deepEqual(outside.plans, []);
  // A member sees when they joined; people the viewer may not see are counted, not listed.
  sides.peopleFilter = (viewerId, userId) => !(viewerId === "alice" && userId === "bob");
  const inside = sides.home(alice, "runners");
  assert.equal(inside.member, true);
  assert.ok(inside.since);
  assert.equal(inside.members.count, 2);
  assert.deepEqual(
    inside.members.people.map((p) => p.id),
    ["alice"],
  );
  // Plans come from the plans layer; the home passes the viewer through.
  sides.planLister = (actor, sideId) =>
    sideId === "runners" && actor.userId === "alice"
      ? [
          {
            postId: "p1",
            title: "Track night",
            caption: "",
            ownerName: "Alice",
            createdAt: "",
            count: 2,
            cameCount: 1,
            going: true,
            came: false,
          },
        ]
      : [];
  assert.equal(sides.home(alice, "runners").plans[0]?.title, "Track night");
  assert.deepEqual(sides.home(bob, "runners").plans, []);
  // So do the regulars (ADR 0034); without the plans layer the list is empty, never missing.
  assert.deepEqual(sides.home(alice, "runners").regulars, []);
  sides.regularLister = (actor, sideId) =>
    sideId === "runners" && actor.userId === "alice"
      ? [{ id: "bob", name: "Bob", handle: "bob", initials: "B", color: "", plans: 3, came: 2 }]
      : [];
  assert.equal(sides.home(alice, "runners").regulars[0]?.came, 2);
  assert.deepEqual(sides.home(bob, "runners").regulars, []);
  // Everyday's home is everyone; a private side and an unknown side both do not exist from outside.
  assert.equal(sides.home(leo, "everyday").members.count, social.users().length);
  rejects(() => sides.home(alice, "film-fest"), "NOT_FOUND");
  rejects(() => sides.home(alice, "mars"), "NOT_FOUND");
  sides.grant("leo", "film-fest");
  assert.equal(sides.home(leo, "film-fest").members.count, 1);
});

test("a side's link shows an open side's home to a guest; private sides and Everyday do not exist", async () => {
  const { sides, post, social, identity, store } = await setup();
  const community = new CommunityService(social, () => false);
  const sharing = new SharingService(social, community, identity, new ProfileService(social));
  sharing.sideHome = (sideId) => sides.home({ userId: GUEST }, sideId);
  sides.join(alice, "runners");
  sides.join(bob, "runners");
  post(alice, "Sunday long run", "runners");
  post(alice, "Breakfast");
  // The guest sees the same as a stranger with an account: everyone counted, the posts listed.
  const page = sharing.side("runners");
  assert.equal(page.member, false);
  assert.equal(page.members.count, 2);
  assert.deepEqual(
    page.members.people.map((p) => p.id),
    ["bob", "alice"],
  );
  assert.equal(page.posts, 1);
  assert.deepEqual(
    page.recent.map((p) => [p.title, p.author?.id]),
    [["Sunday long run", "alice"]],
  );
  // A hidden person is counted but not listed, and their posts are not shown.
  sides.peopleFilter = (viewerId, userId) => community.canSeeUser(viewerId, userId);
  store.put("suspension", "alice", { userId: "alice" });
  const after = sharing.side("runners");
  assert.deepEqual(
    after.members.people.map((p) => p.id),
    ["bob"],
  );
  assert.equal(after.members.count, 2);
  assert.deepEqual(after.recent, []);
  // Private sides and Everyday are never a page, even for a guest who guesses the id.
  sides.grant("leo", "film-fest");
  rejects(() => sharing.side("film-fest"), "NOT_FOUND");
  rejects(() => sharing.side("everyday"), "NOT_FOUND");
  rejects(() => sharing.side("mars"), "NOT_FOUND");
  rejects(() => sides.home({ userId: GUEST }, "film-fest"), "NOT_FOUND");
  // A guest can never be taken for a member or a plan's viewer.
  rejects(() => sides.join({ userId: GUEST }, "runners"), "UNAUTHENTICATED");
});
