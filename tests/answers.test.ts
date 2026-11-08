import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { CommunityService } from "../packages/core/src/community.js";
import { buildPost, firstReact, startPostDesign } from "../packages/core/src/easy-post.js";

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

test("how much two people agree, and today's format is the same post for everyone that day", async () => {
  const { social, answer, quiz } = await setup();
  const draft = social.createDraft({ userId: "ana" }, post(["answers.write", "answers.read"]));
  const ranking = social.publish({ userId: "ana" }, draft.id, 1);
  const rank = (userId: string, tiers: string[]) =>
    social.capability({ userId }, ranking.id, "answers.write", {
      pick: "x",
      placed: ["a", "b", "c", "d"].map((item, i) => ({ item, tier: tiers[i] })),
    });
  answer("budi", { pick: "Indomie" });
  answer("citra", { pick: "indomie" });
  answer("dian", { score: 2, of: 3 });
  rank("budi", ["S", "A", "B", "C"]);
  rank("citra", ["S", "A", "C", "C"]);
  // Same pick (any case) is one full agreement; the ranking agrees on three of four items.
  assert.deepEqual(social.match({ userId: "budi" }, "citra"), { shared: 2, percent: 88 });
  // A score isn't an opinion, so it shares nothing.
  assert.deepEqual(social.match({ userId: "budi" }, "dian"), { shared: 0, percent: null });
  social.follow({ userId: "budi" }, "citra");
  social.follow({ userId: "budi" }, "dian");
  assert.deepEqual(
    social.matches({ userId: "budi" }).map((m) => [m.userId, m.percent]),
    [["citra", 88]],
  );

  const today = social.today({ userId: "budi" }, "2026-11-08");
  assert.ok(today && [quiz.id, ranking.id].includes(today.post.id));
  assert.equal(social.today({ userId: "dian" }, "2026-11-08")?.post.id, today.post.id);
  const days = new Set(
    ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"].map(
      (d) => social.today({ userId: "budi" }, d)?.post.id,
    ),
  );
  assert.equal(days.size, 2, "it changes from day to day");
});

test("people hear when friends answer what they answered, and when their format gets a version", async () => {
  const { social, community, quiz, answer } = await setup();
  social.follow({ userId: "budi" }, "citra");
  answer("budi", { pick: "Indomie" });
  answer("citra", { pick: "Mie Sedaap" });
  answer("citra", { pick: "Indomie" });
  answer("dian", { pick: "Indomie" });
  const budi = community.notifications({ userId: "budi" }).filter((n) => n.type !== "follow");
  assert.deepEqual(
    budi.map((n) => [n.type, n.actor?.id, n.answer?.theirs?.pick]),
    [["answered-too", "citra", "Indomie"]],
    "once, only from people Budi follows",
  );
  assert.ok(
    !community.notifications({ userId: "citra" }).some((n) => n.type === "answered-too"),
    "Budi isn't followed back",
  );

  // A version of Ana's quiz: Ana hears it, with its number.
  for (const userId of ["budi", "citra"]) {
    const draft = social.createDraft({ userId }, post(["answers.write"]), quiz.id);
    social.publish({ userId }, draft.id, draft.revision);
  }
  const versions = community.notifications({ userId: "ana" }).filter((n) => n.type === "version");
  assert.deepEqual(
    versions.map((n) => [n.actor?.id, n.nth]),
    [
      ["citra", 2],
      ["budi", 1],
    ],
  );
});

test("saying I'm in to the same plan counts toward how much two people match", async () => {
  const { social, store } = await setup();
  store.transaction(() => {
    store.put("rsvp", "p1:budi", { postId: "p1", userId: "budi", at: "x" });
    store.put("rsvp", "p1:citra", { postId: "p1", userId: "citra", at: "x" });
    store.put("rsvp", "p2:budi", { postId: "p2", userId: "budi", at: "x" });
  });
  assert.deepEqual(social.match({ userId: "budi" }, "citra"), { shared: 1, percent: 100 });
  assert.deepEqual(social.match({ userId: "budi" }, "dian"), { shared: 0, percent: null });
});

test("today's format turns kinds with the weekday, leans on everyday questions, and skips emoji taps", async () => {
  const { social, quiz } = await setup();
  const easy = (design: Parameters<typeof buildPost>[0]) => {
    const built = buildPost(design);
    const draft = social.createDraft(
      { userId: "budi" },
      { package: built.package, metadata: { ...built.metadata, caption: "", contributors: [] } },
    );
    return social.publish({ userId: "budi" }, draft.id, draft.revision);
  };
  const everyday = easy(startPostDesign("ask", { headline: "Coffee or tea?" }));
  const react = easy({ ...startPostDesign("note"), ask: firstReact() });
  const draft = social.createDraft({ userId: "ana" }, post(["answers.write", "answers.read"]));
  const ranking = social.publish({ userId: "ana" }, draft.id, 1);
  social.capability({ userId: "citra" }, ranking.id, "answers.write", {
    placed: [{ item: "a", tier: "S" }],
  });

  const on = (date: string) => social.today({ userId: "dian" }, date);
  assert.equal(on("2026-11-09")?.post.id, everyday.id, "Monday: someone's everyday question");
  assert.equal(on("2026-11-09")?.kind, "everyday");
  assert.equal(on("2026-11-12")?.post.id, ranking.id, "Thursday: rank it");
  assert.equal(on("2026-11-10")?.post.id, quiz.id, "Tuesday: something to play");
  for (const d of [
    "2026-11-08",
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
  ])
    assert.notEqual(on(d)?.post.id, react.id, "an emoji tap isn't a format");
});
