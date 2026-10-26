import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { ProgramService } from "../packages/core/src/programs.js";
import { GUEST, SocialService } from "../packages/core/src/social.js";
import { applySmudgeSettings, defaultSmudgeSettings } from "../packages/core/src/smudge-design.js";
import { smudgeProfilePackage } from "../apps/server/smudge-profile.js";

const rina = { userId: "rina" },
  dika = { userId: "dika" },
  sari = { userId: "sari" };
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "forma-programs-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  store.transaction(() => {
    for (const id of ["rina", "dika", "sari"])
      store.put("user", id, {
        id,
        name: id[0]!.toUpperCase() + id.slice(1),
        handle: id,
        initials: id[0]!.toUpperCase(),
        color: "#eee",
        bio: "",
      });
  });
  let at = new Date("2026-10-26T10:00:00Z");
  const social = new SocialService(store);
  const programs = new ProgramService(social, () => at);
  return { store, social, programs, tick: (h: number) => (at = new Date(+at + h * 3_600_000)) };
}
const questions = [
  { text: "My coffee?", options: ["Black", "Latte", "None"], answer: 1 },
  { text: "First concert?", options: ["After Hours", "Nova Reyes"], answer: 0 },
];

test("the quiz: the owner writes questions, friends answer, the board ranks them, answers stay hidden", async () => {
  const { programs, tick } = await setup();
  assert.deepEqual(programs.quizRead("dika", "rina").questions, []);
  rejects(() => programs.quizAnswer(dika, "rina", { answers: [1] }), "NOT_FOUND");
  assert.throws(() =>
    programs.setQuiz(rina, { questions: [{ text: "?", options: ["a", "b"], answer: 2 }] }),
  );
  programs.setQuiz(rina, { questions });
  const read = programs.quizRead("dika", "rina");
  assert.equal(read.questions.length, 2);
  assert.equal("answer" in read.questions[0]!, false);
  assert.equal(read.mine, null);
  rejects(() => programs.quizAnswer(rina, "rina", { answers: [1, 0] }), "OWN_QUIZ");
  rejects(
    () => programs.quizAnswer({ userId: GUEST }, "rina", { answers: [1, 0] }),
    "SIGN_IN_REQUIRED",
  );
  rejects(() => programs.quizAnswer(dika, "rina", { answers: [1] }), "VALIDATION_FAILED");
  const mine = programs.quizAnswer(dika, "rina", { answers: [1, 1] });
  assert.equal(mine.mine?.score, 1);
  assert.deepEqual(mine.mine?.correct, [1, 0]);
  programs.quizAnswer(sari, "rina", { answers: [1, 0] });
  const board = programs.quizRead(GUEST, "rina");
  assert.deepEqual(
    board.board.map((b) => `${b.name} ${b.score}`),
    ["Sari 2", "Dika 1"],
  );
  assert.equal(board.takers, 2);
  // A second try replaces the first (ties go to the earlier one); new questions wipe the board.
  tick(1);
  programs.quizAnswer(dika, "rina", { answers: [1, 0] });
  assert.equal(programs.quizRead("dika", "rina").board[0]!.name, "Sari");
  assert.equal(programs.quizRead("dika", "rina").takers, 2);
  programs.setQuiz(rina, { questions: questions.slice(0, 1) });
  assert.equal(programs.quizRead("dika", "rina").takers, 0);
  // Privacy closes it like the posts.
  programs.viewFilter = () => false;
  assert.deepEqual(programs.quizRead("dika", "rina").questions, []);
  rejects(() => programs.quizAnswer(dika, "rina", { answers: [1] }), "NOT_FOUND");
});

test("the cat: friends feed it once a day each; its mood follows the attention", async () => {
  const { programs, tick } = await setup();
  assert.equal(programs.catRead("dika", "rina").mood, "hungry");
  rejects(() => programs.catFeed({ userId: GUEST }, "rina"), "SIGN_IN_REQUIRED");
  const fed = programs.catFeed(dika, "rina");
  assert.equal(fed.mood, "fine");
  assert.equal(fed.fedByMe, true);
  assert.deepEqual(
    fed.today.map((f) => f.name),
    ["Dika"],
  );
  rejects(() => programs.catFeed(dika, "rina"), "CAT_FED");
  programs.catFeed(sari, "rina");
  programs.catFeed(rina, "rina");
  assert.equal(programs.catRead(GUEST, "rina").mood, "happy");
  assert.equal(programs.catRead(GUEST, "rina").fedByMe, false);
  tick(25);
  const later = programs.catRead("dika", "rina");
  assert.equal(later.mood, "hungry");
  assert.equal(later.today.length, 0);
  assert.equal(later.feeds, 3);
  assert.equal(programs.catFeed(dika, "rina").mood, "fine");
  // Deleting Dika's account takes Dika's two feeds with it.
  programs.erase("dika");
  assert.equal(programs.catRead("sari", "rina").feeds, 2);
});

test("the capability path answers reads for guests and refuses the rest; sections grant their methods", async () => {
  const { programs } = await setup();
  programs.setQuiz(rina, { questions });
  const guest = { userId: GUEST };
  assert.equal(
    (programs.capability(guest, "rina", "quiz.read", undefined) as { takers: number }).takers,
    0,
  );
  assert.equal(
    (programs.capability(guest, "rina", "cat.read", undefined) as { mood: string }).mood,
    "hungry",
  );
  rejects(() => programs.capability(guest, "rina", "cat.feed", undefined), "SIGN_IN_REQUIRED");
  rejects(() => programs.capability(dika, "rina", "nope.read", undefined), "CAPABILITY_DENIED");
  const pkg = applySmudgeSettings(smudgeProfilePackage, {
    ...defaultSmudgeSettings,
    sections: [...defaultSmudgeSettings.sections, "quiz", "cat", "wall"],
    cat: { name: "Mochi" },
  });
  for (const cap of ["quiz.read", "quiz.answer", "cat.read", "cat.feed", "profile.wall.add"])
    assert.ok(pkg.manifest.capabilities.includes(cap as never), cap);
  const off = applySmudgeSettings(pkg, { ...defaultSmudgeSettings, sections: ["latest"] });
  assert.ok(!off.manifest.capabilities.some((c) => c.startsWith("quiz.") || c.startsWith("cat.")));
});
