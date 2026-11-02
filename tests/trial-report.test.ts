import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { OpenCounter, orgTrial, postTrial } from "../packages/core/src/trial-report.js";

test("the trial counts opens, plays, sign-ups, returns and own versions, without names", async () => {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-trial-")), "db.sqlite"));
  const opens = new OpenCounter(store);
  opens.count("post", "tier", new Date("2026-11-03T08:00:00Z"));
  opens.count("post", "tier", new Date("2026-11-03T09:00:00Z"));
  opens.flush();
  opens.count("post", "tier", new Date("2026-11-04T09:00:00Z"));
  opens.flush();
  store.transaction(() => {
    store.put("post", "tier", {
      id: "tier",
      ownerId: "maya",
      createdAt: "2026-11-03T07:00:00Z",
      metadata: { title: "Tier" },
    });
    // Rani made an account for it and came back the next day with her own version.
    store.put("credential", "rani", { createdAt: "2026-11-03T08:05:00Z" });
    store.put("answer", "tier:rani", {
      postId: "tier",
      userId: "rani",
      at: "2026-11-03T08:10:00Z",
    });
    store.put("post", "rani-tier", {
      id: "rani-tier",
      ownerId: "rani",
      remixOf: "tier",
      createdAt: "2026-11-04T10:00:00Z",
      metadata: { title: "Mine" },
    });
    // Leo already had an account and played once.
    store.put("credential", "leo", { createdAt: "2026-01-01T00:00:00Z" });
    store.put("answer", "tier:leo", { postId: "tier", userId: "leo", at: "2026-11-03T09:10:00Z" });
    store.put("chapter", "c1", {
      ownerId: "rani",
      orgId: "teater-senja",
      kind: "member",
      method: "invite",
      createdAt: "2026-11-03T08:20:00Z",
    });
    store.put("chapter", "c2", {
      ownerId: "leo",
      orgId: "teater-senja",
      kind: "title",
      method: "invite",
      createdAt: "2026-11-03T08:20:00Z",
    });
  });
  const post = postTrial(store, opens, "tier");
  assert.deepEqual(post.opensByDay, { "2026-11-03": 2, "2026-11-04": 1 });
  assert.equal(post.opens, 3);
  assert.equal(post.answered, 2);
  assert.equal(post.newAccounts, 1);
  assert.equal(post.cameBack, 1);
  assert.equal(post.madeTheirOwn, 1);
  const org = orgTrial(store, opens, "teater-senja");
  assert.equal(org.joined, 1, "a title is not a join");
  assert.equal(org.newAccounts, 1);
  assert.equal(org.cameBack, 1);
  assert.deepEqual(org.joinedByDay, { "2026-11-03": 1 });
  assert.throws(() => orgTrial(store, opens, "nowhere"));

  // Oprec and room numbers.
  store.transaction(() => {
    store.put("term", "ts-1", { id: "ts-1", orgId: "teater-senja" });
    store.put("oprec", "op-1", { id: "op-1", orgId: "teater-senja" });
    store.put("oprec-application", "a1", {
      oprecId: "op-1",
      userId: "rani",
      status: "accepted",
      createdAt: "2026-11-03T08:30:00Z",
    });
    store.put("oprec-application", "a2", {
      oprecId: "op-1",
      userId: "leo",
      status: "applied",
      createdAt: "2026-11-03T09:30:00Z",
    });
    store.put("room-seen", "ts-1:rani", { days: ["2026-11-03", "2026-11-05"] });
    store.put("room-seen", "ts-1:leo", { days: ["2026-11-03"] });
    store.put("room-seen", "other-term:leo", { days: ["2026-11-04"] });
    store.put("room-post", "p1", { termId: "ts-1", userId: "rani" });
  });
  const more = orgTrial(store, opens, "teater-senja");
  assert.deepEqual([more.applied, more.accepted, more.appliedNewAccounts], [2, 1, 1]);
  assert.deepEqual([more.roomReaders, more.roomReturning, more.roomTalkers], [2, 1, 1]);
});
