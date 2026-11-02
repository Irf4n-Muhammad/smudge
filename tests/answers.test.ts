import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { CommunityService } from "../packages/core/src/community.js";

const post = (capabilities: string[]) => ({
  package: {
    manifest: {
      schemaVersion: 2 as const,
      runtimeVersion: "web-v1" as const,
      name: "Quiz",
      entrypoint: "index.html",
      capabilities,
      assets: [],
    },
    files: { "index.html": "<h1>Quiz</h1>" },
  },
  metadata: { title: "Quiz", format: "custom" as const, caption: "", contributors: [] },
});
async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-answers-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["ana", "budi", "citra", "dian"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  const social = new SocialService(store);
  const community = new CommunityService(social, () => false);
  const draft = social.createDraft({ userId: "ana" }, post(["answers.write", "answers.read"]));
  const quiz = social.publish({ userId: "ana" }, draft.id, 1);
  const answer = (userId: string, value: unknown) =>
    social.capability({ userId }, quiz.id, "answers.write", value);
  return { store, social, community, quiz, answer };
}

test("you see your own answer and those of people you follow; strangers only add to the count", async () => {
  const { social, community, quiz, answer } = await setup();
  social.follow({ userId: "dian" }, "budi");
  answer("budi", { score: 3, of: 3 });
  answer("citra", { pick: "Indomie" });
  const view = answer("dian", { score: 1, of: 3 }) as ReturnType<SocialService["answers"]>;
  assert.equal(view.count, 3);
  assert.deepEqual(view.mine, { userId: "dian", name: "dian", handle: "dian", score: 1, of: 3 });
  assert.deepEqual(
    view.friends.map((a) => [a.name, a.score]),
    [["budi", 3]],
  );
  // Answering again replaces your answer.
  answer("dian", { score: 2, of: 3 });
  assert.equal(social.answers({ userId: "dian" }, quiz.id).count, 3);
  assert.equal(social.answers({ userId: "dian" }, quiz.id).mine?.score, 2);
});
test("the maker hears who played and how, once per player, with a follow offer", async () => {
  const { social, community, answer } = await setup();
  answer("ana", { score: 2, of: 3 });
  answer("budi", { score: 1, of: 3 });
  answer("budi", { score: 3, of: 3 });
  answer("citra", { pick: "Indomie" });
  const played = community
    .notifications({ userId: "ana" })
    .filter((n) => n.type === "answer")
    .map((n) => [n.actor?.id, n.answer?.theirs, n.answer?.yours?.score, n.youFollow]);
  // Playing again refreshes budi's notification; the maker's own answer notifies nobody.
  assert.deepEqual(played, [
    ["citra", { pick: "Indomie", score: null, of: null }, 2, false],
    ["budi", { pick: null, score: 3, of: 3 }, 2, false],
  ]);
  social.follow({ userId: "ana" }, "budi");
  assert.equal(
    community.notifications({ userId: "ana" }).find((n) => n.actor?.id === "budi")?.youFollow,
    true,
  );
});

test("answers are checked, need the capability, and go with the post or the account", async () => {
  const { store, social, community, quiz, answer } = await setup();
  for (const bad of [{}, { score: 4, of: 3 }, { score: 1 }, { pick: "" }, { pick: "x", extra: 1 }])
    assert.throws(() => answer("budi", bad));
  const draft = social.createDraft({ userId: "ana" }, post([]));
  const plain = social.publish({ userId: "ana" }, draft.id, 1);
  assert.throws(
    () => social.capability({ userId: "budi" }, plain.id, "answers.write", { pick: "x" }),
    (e: { code?: string }) => e.code === "CAPABILITY_DENIED",
  );
  answer("budi", { pick: "Mie Sedaap" });
  answer("citra", { pick: "Indomie" });
  store.transaction(() => community.erase("budi"));
  assert.equal(social.answers({ userId: "ana" }, quiz.id).count, 1);
  social.deletePost({ userId: "ana" }, quiz.id);
  assert.equal(store.all("answer").length, 0);
});
test("a tier list keeps where each item went, and friends see it to compare", async () => {
  const { social, quiz, answer } = await setup();
  social.follow({ userId: "dian" }, "budi");
  const placed = [
    { item: "Spicy ramen", tier: "S" },
    { item: "Smash burger", tier: "C" },
  ];
  answer("budi", { pick: "Spicy ramen", placed });
  const view = social.answers({ userId: "dian" }, quiz.id);
  assert.deepEqual(view.friends[0]?.placed, placed);
  // One place per item; an empty ranking is not an answer.
  assert.throws(() =>
    answer("dian", {
      placed: [
        { item: "Spicy ramen", tier: "S" },
        { item: "Spicy ramen", tier: "A" },
      ],
    }),
  );
  assert.throws(() => answer("dian", { placed: [] }));
});
