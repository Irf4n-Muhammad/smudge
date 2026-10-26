import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { NowService } from "../packages/core/src/now.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import { setupColours, setupPage } from "../packages/core/src/setup.js";
import { readSmudgeSettings } from "../packages/core/src/smudge-design.js";
import { GUEST, SocialService } from "../packages/core/src/social.js";
import { profileTemplates } from "../apps/server/seed-profiles.js";
import { seedSmudge } from "../apps/server/seed-smudge.js";

const rina = { userId: "rina" },
  dika = { userId: "dika" };
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "forma-now-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  store.transaction(() => {
    for (const id of ["rina", "dika"])
      store.put("user", id, {
        id,
        name: id[0]!.toUpperCase() + id.slice(1),
        handle: id,
        initials: id[0]!.toUpperCase(),
        color: "#eee",
        bio: "",
      });
  });
  let at = new Date("2026-10-25T10:00:00Z");
  const clock = () => at;
  const social = new SocialService(store);
  // The Paint wall template points at the demo's shared pictures.
  seedSmudge(social);
  const now = new NowService(social, clock);
  const profiles = new ProfileService(social);
  profiles.extras = (viewerId, ownerId) => ({ now: now.live(viewerId, ownerId) });
  return { store, social, now, profiles, tick: (m: number) => (at = new Date(+at + m * 60_000)) };
}

test("one tap adds an entry; the newest is current and the rest pile up as an archive", async () => {
  const { now, tick } = await setup();
  now.add(rina, { kind: "listening", text: "Velvet Static", by: "After Hours" });
  tick(30);
  const doing = now.add(rina, { kind: "doing", text: "on the train" });
  const mine = now.archive("rina", "rina");
  assert.equal(mine.total, 2);
  assert.equal(mine.current?.id, doing.id);
  assert.deepEqual(
    mine.entries.map((e) => e.kind),
    ["doing", "listening"],
  );
  assert.throws(() => now.add(rina, { kind: "doing", text: "" }));
  rejects(() => now.remove(dika, doing.id), "NOT_FOUND");
  now.remove(rina, doing.id);
  assert.equal(now.archive("rina", "rina").current?.kind, "listening");
});

test("friends and guests read it under the owner's privacy rules; a page program gets a live summary", async () => {
  const { now, profiles } = await setup();
  now.add(rina, { kind: "listening", text: "Velvet Static", by: "After Hours" });
  now.add(rina, { kind: "place", text: "Bandung" });
  assert.equal(now.archive("dika", "rina").total, 2);
  assert.equal(now.archive(GUEST, "rina").total, 2);
  const live = now.live(GUEST, "rina");
  assert.equal(live.current?.text, "Bandung");
  assert.equal(live.listening?.by, "After Hours");
  // The server installs the rule; here only Dika may look.
  now.viewFilter = (viewer) => viewer === "dika";
  assert.equal(now.archive(GUEST, "rina").total, 0);
  assert.equal(now.archive("dika", "rina").total, 2);
  assert.equal(now.archive("rina", "rina").total, 2);
  assert.equal(
    (profiles.extras("dika", "rina").now as { current: unknown }).current !== null,
    true,
  );
  now.erase("rina");
  assert.equal(now.archive("rina", "rina").total, 0);
});

test("five answers publish a page with the line, colour, song and first entries", async () => {
  const { now, profiles, social } = await setup();
  const vibes = Object.entries(profileTemplates).map(([key, t]) => ({
    key,
    colours: setupColours(t),
  }));
  assert.ok(vibes.find((v) => v.key === "smudge")!.colours.some((c) => c.key === "ocean"));
  assert.ok(vibes.find((v) => v.key === "room")!.colours.some((c) => c.key === "sage"));
  assert.ok(vibes.find((v) => v.key === "comic")!.colours.some((c) => c.key === "red"));
  assert.deepEqual(vibes.find((v) => v.key === "basic")!.colours, []);
  const { publicationId } = setupPage(profiles, now, profileTemplates, rina, {
    bio: "Drawing people on trains",
    vibe: "smudge",
    colour: "ocean",
    song: { title: "Velvet Static", artist: "After Hours" },
    doing: "on the train",
  });
  const state = profiles.state("rina");
  assert.equal(state.publicationId, publicationId);
  assert.equal(state.version, 1);
  const settings = readSmudgeSettings(profiles.publication(publicationId!).package);
  assert.equal(settings.palette, "ocean");
  assert.equal(settings.tagline, "Drawing people on trains");
  assert.equal(settings.repeat.song, "Velvet Static");
  assert.ok(settings.sections.includes("now") && settings.sections.includes("repeat"));
  assert.equal(social.users().find((u) => u.id === "rina")!.bio, "Drawing people on trains");
  const archive = now.archive("rina", "rina");
  assert.deepEqual(
    archive.entries.map((e) => e.kind),
    ["doing", "listening"],
  );
  // A comic takes a tint; a wrong colour or vibe is refused before anything is published.
  rejects(
    () =>
      setupPage(profiles, now, profileTemplates, dika, { bio: "", vibe: "comic", colour: "ocean" }),
    "VALIDATION_FAILED",
  );
  rejects(
    () => setupPage(profiles, now, profileTemplates, dika, { bio: "", vibe: "nope" }),
    "NOT_FOUND",
  );
  setupPage(profiles, now, profileTemplates, dika, { bio: "", vibe: "comic", colour: "red" });
  assert.equal(profiles.state("dika").version, 1);
  assert.equal(now.archive("dika", "dika").total, 0);
});

test("the first screen lists what the people you follow are up to; a widget reads one friend", async () => {
  const { now, social, tick } = await setup();
  now.add(rina, { kind: "listening", text: "Velvet Static", by: "After Hours" });
  tick(5);
  now.add(rina, { kind: "place", text: "Bandung" });
  // Nobody followed yet, so nothing to show.
  assert.deepEqual(now.friends(dika), []);
  social.follow(dika, "rina");
  const row = now.friends(dika);
  assert.equal(row.length, 1);
  assert.equal(row[0]!.user.handle, "rina");
  assert.equal(row[0]!.entry.text, "Bandung");
  assert.equal("bio" in row[0]!.user, false);
  const widget = now.widget(GUEST, "rina");
  assert.equal(widget.current?.text, "Bandung");
  assert.equal(widget.listening?.by, "After Hours");
  assert.equal(widget.total, 2);
  // The privacy rule hides both the row and the widget.
  now.viewFilter = () => false;
  assert.deepEqual(now.friends(dika), []);
  assert.equal(now.widget(GUEST, "rina").current, null);
  rejects(() => now.widget(GUEST, "nobody"), "NOT_FOUND");
});

test("entries read from a source sit in the archive with the typed ones and cannot be removed", async () => {
  const { now, tick } = await setup();
  now.add(rina, { kind: "doing", text: "on the train" });
  tick(10);
  const at = new Date(+new Date("2026-10-25T10:00:00Z") + 5 * 60_000).toISOString();
  now.sources.push((ownerId) =>
    ownerId === "rina"
      ? [
          {
            id: "spotify:rina",
            kind: "listening",
            text: "Velvet Static",
            by: "After Hours",
            at,
            source: "spotify",
          },
        ]
      : [],
  );
  const mine = now.archive("rina", "rina");
  assert.deepEqual(
    mine.entries.map((e) => e.kind),
    ["listening", "doing"],
  );
  assert.equal(now.live("rina", "rina").listening?.source, "spotify");
  rejects(() => now.remove(rina, "spotify:rina"), "NOT_FOUND");
  assert.deepEqual(now.songs(rina), [{ text: "Velvet Static", by: "After Hours" }]);
  assert.deepEqual(now.songs(dika), []);
  now.erase("rina");
  assert.equal(now.archive("rina", "rina").total, 1);
});
