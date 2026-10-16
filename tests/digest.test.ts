import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { CommunityService } from "../packages/core/src/community.js";
import { MessageService } from "../packages/core/src/messages.js";
import { ActivityDigest } from "../packages/core/src/digest.js";

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-dig-")), "db.sqlite"));
  const clock = { now: new Date("2026-03-10T10:00:00Z") };
  store.transaction(() => {
    for (const [id, name] of [
      ["ana", "Ana Lestari"],
      ["budi", "Budi Santoso"],
    ] as const) {
      store.put("user", id, { id, name, handle: id, initials: "X", color: "#fff", bio: "" });
      store.put("credential", id, {
        userId: id,
        email: `${id}@mail.test`,
        emailVerified: true,
        passwordHash: "x",
        createdAt: "2026-03-01T00:00:00Z",
      });
    }
  });
  const social = new SocialService(store);
  const community = new CommunityService(
    social,
    () => false,
    () => clock.now,
  );
  const messages = new MessageService(social, community, () => clock.now);
  const digest = new ActivityDigest(social, community, "https://smudge.test", () => clock.now);
  const later = (minutes: number) => (clock.now = new Date(clock.now.getTime() + minutes * 60_000));
  const mail = () =>
    store.all<{ to: string; subject: string; body: string }>("outbox").filter((m) => m.to);
  return { store, social, community, messages, digest, later, mail };
}

test("activity while away becomes one email, never for things already seen", async () => {
  const { social, community, messages, digest, later, mail } = await setup();
  social.follow({ userId: "ana" }, "budi");
  // Budi sees Ana's follow in the app, so it never reaches his inbox.
  community.markRead({ userId: "budi" });
  social.follow({ userId: "budi" }, "ana");
  messages.send({ userId: "budi" }, "ana", { text: "Hi Ana!" });
  // Too fresh: Ana may still be in the app.
  assert.deepEqual(digest.run(), { sent: 0 });
  later(15);
  assert.deepEqual(digest.run(), { sent: 1 });
  const [email] = mail();
  assert.equal(email!.to, "ana@mail.test");
  assert.equal(email!.subject, "You have new messages on Smudge");
  assert.match(email!.body, /Budi Santoso started following you\./);
  assert.match(email!.body, /New messages from Budi Santoso\./);
  assert.match(email!.body, /https:\/\/smudge\.test/);
  // Nothing new, and the next one waits a few hours anyway.
  later(30);
  assert.deepEqual(digest.run(), { sent: 0 });
});

test("people can turn activity emails off", async () => {
  const { social, digest, later, mail } = await setup();
  assert.deepEqual(digest.prefs({ userId: "ana" }), { activity: true });
  digest.setPrefs({ userId: "ana" }, { activity: false });
  social.follow({ userId: "budi" }, "ana");
  later(15);
  assert.deepEqual(digest.run(), { sent: 0 });
  assert.equal(mail().length, 0);
});
