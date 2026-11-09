import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { SurpriseService } from "../packages/core/src/surprises.js";

const now = new Date("2026-11-09T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-surprise-")), "db.sqlite"));
  const post = (id: string, ownerId: string, at: string, remixOf?: string) =>
    store.put("post", id, {
      id,
      ownerId,
      createdAt: at,
      metadata: { title: id },
      ...(remixOf ? { remixOf } : {}),
    });
  store.transaction(() => {
    for (const id of ["alex", "maya", "leo", "ines", "kai"])
      store.put("user", id, { id, name: id, handle: id, initials: id[0], color: "#eee" });
    // Alex follows Maya and Leo, not Ines or Kai.
    store.put("follow", "alex:maya", { userId: "alex", target: "maya" });
    store.put("follow", "alex:leo", { userId: "alex", target: "leo" });
    post("tier", "alex", hoursAgo(100));
    post("plan", "ines", hoursAgo(100));
    post("quiz", "kai", hoursAgo(100));
    // Two people made a version of Alex's post; Ines's is the newest.
    post("maya-tier", "maya", hoursAgo(5), "tier");
    post("ines-tier", "ines", hoursAgo(2), "tier");
    // Leo, whom Alex follows, remade Kai's quiz; Kai, whom Alex doesn't follow, remade Ines's plan.
    post("leo-quiz", "leo", hoursAgo(3), "quiz");
    post("kai-plan", "kai", hoursAgo(1), "plan");
    // A version from last week is old news.
    post("old-tier", "kai", hoursAgo(80), "tier");
    store.put("answer", "tier:leo", { postId: "tier", userId: "leo", at: hoursAgo(4) });
    store.put("answer", "tier:kai", { postId: "tier", userId: "kai", at: hoursAgo(6) });
    store.put("answer", "tier:alex", { postId: "tier", userId: "alex", at: hoursAgo(1) });
    // Alex and Maya are in Ines's plan; Kai joined too, but Alex doesn't follow Kai.
    store.put("rsvp", "plan:alex", { postId: "plan", userId: "alex", at: hoursAgo(60) });
    store.put("rsvp", "plan:maya", { postId: "plan", userId: "maya", at: hoursAgo(7) });
    store.put("rsvp", "plan:kai", { postId: "plan", userId: "kai", at: hoursAgo(7) });
  });
  const social = new SocialService(store);
  return { store, social, surprises: new SurpriseService(social, () => now) };
}

test("feed surprises: versions of yours, answers to yours, friends in your plan, friends' versions", async () => {
  const { surprises } = await setup();
  const cards = surprises.for({ userId: "alex" });
  assert.deepEqual(
    cards.map((c) => [c.kind, c.postId, c.people.map((p) => p.id), c.count]),
    [
      ["version-of-yours", "ines-tier", ["ines", "maya"], 2],
      ["friend-version", "leo-quiz", ["leo"], 1],
      ["answered-yours", "tier", ["leo", "kai"], 2],
      ["same-plan", "plan", ["maya"], 1],
    ],
  );
  assert.equal(cards[0]!.title, "tier");
});

test("a surprise leaves out people the viewer may not see, and drops a card with nobody left", async () => {
  const { surprises } = await setup();
  surprises.peopleFilter = (_viewer, userId) => userId !== "maya" && userId !== "leo";
  const cards = surprises.for({ userId: "alex" });
  assert.deepEqual(
    cards.map((c) => [c.kind, c.postId, c.people.map((p) => p.id)]),
    [
      ["version-of-yours", "ines-tier", ["ines"]],
      ["answered-yours", "tier", ["kai"]],
    ],
  );
});

test("a post the viewer may not see makes no surprise", async () => {
  const { social, surprises } = await setup();
  social.viewFilter = (_viewer, post) => post.id !== "ines-tier" && post.id !== "plan";
  const kinds = surprises.for({ userId: "alex" }).map((c) => [c.kind, c.postId]);
  assert.deepEqual(kinds, [
    ["friend-version", "leo-quiz"],
    ["answered-yours", "tier"],
    ["version-of-yours", "maya-tier"],
  ]);
});
