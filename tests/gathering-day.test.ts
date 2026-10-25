import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { exifTakenAt } from "../packages/core/src/exif.js";
import { MomentDayService } from "../packages/core/src/gathering-day.js";
import { GatheringsService } from "../packages/core/src/gatherings.js";
import { formatMomentReport, momentReport } from "../packages/core/src/moment-report.js";
import { GUEST, SocialService } from "../packages/core/src/social.js";

const dina = { userId: "dina" },
  bob = { userId: "bob" },
  cara = { userId: "cara" };
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "forma-day-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  store.transaction(() => {
    for (const id of ["dina", "bob", "cara"])
      store.put("user", id, {
        id,
        name: id[0]!.toUpperCase() + id.slice(1),
        handle: id,
        initials: id[0]!.toUpperCase(),
        color: "#eee",
      });
  });
  let now = new Date("2026-12-12T02:00:00Z");
  const clock = () => now;
  const social = new SocialService(store);
  const gatherings = new GatheringsService(social, clock);
  const day = new MomentDayService(social, gatherings, join(dir, "moments"), clock);
  const invite = gatherings.create(dina, {
    kind: "wedding",
    title: "Dina & Raka",
    date: "2026-12-12",
    place: "Gedung Sate",
    rundown: [
      { time: "11:00", title: "Resepsi" },
      { time: "09:00", title: "Akad" },
    ],
  });
  gatherings.join(bob, invite.id);
  const tick = (ms: number) => (now = new Date(now.getTime() + ms));
  const photo = (actor: { userId: string }, takenAt: string | null, clientTime?: string) =>
    day.upload(actor, invite.id, {
      full: Buffer.from("full"),
      small: Buffer.from("small"),
      width: 4,
      height: 3,
      takenAt,
      clientTime,
    }).id;
  return { store, gatherings, day, invite, tick, photo };
}

test("the door code changes every 30 seconds, and a scan becomes a pass that records arrival", async () => {
  const { gatherings, day, invite, tick } = await setup();
  rejects(() => day.door(bob, invite.id), "NOT_HOST");
  const first = day.door(dina, invite.id);
  assert.equal(first.path, `/m/${invite.id}?pintu=${first.code}`);
  assert.equal(first.arrived, 0);
  tick(30_000);
  assert.notEqual(day.door(dina, invite.id).code, first.code);
  // A code scanned a moment ago still works; one from minutes ago does not.
  const { pass } = day.exchange(invite.id, { code: first.code });
  tick(90_000);
  rejects(() => day.exchange(invite.id, { code: first.code }), "DOOR_CODE_EXPIRED");
  rejects(() => day.exchange(invite.id, { code: "made-up" }), "DOOR_CODE_EXPIRED");
  // Cara makes an account at the door, then checks in with the pass: she is in, and counted.
  tick(10 * 60_000);
  const space = day.checkin(cara, invite.id, { pass });
  assert.deepEqual(space.arrived, ["cara"]);
  day.checkin(cara, invite.id, { pass });
  assert.equal(day.door(dina, invite.id).arrived, 1);
  assert.equal(gatherings.guests(dina, invite.id).totals.arrived, 1);
  rejects(() => day.checkin(bob, invite.id, { pass: pass + "x" }), "DOOR_PASS_EXPIRED");
  rejects(() => day.checkin(bob, invite.id, { pass: `1${pass}` }), "DOOR_PASS_EXPIRED");
  tick(13 * 60 * 60_000);
  rejects(() => day.checkin(bob, invite.id, { pass }), "DOOR_PASS_EXPIRED");
  rejects(() => day.checkin({ userId: GUEST }, invite.id, { pass }), "UNAUTHENTICATED");
});

test("photos fall into chapters by the rundown, by the camera's time first", async () => {
  const { day, invite, photo } = await setup();
  rejects(() => photo(cara, null), "NOT_FOUND");
  photo(bob, "2026-12-12T09:30");
  photo(bob, "2026-12-12T08:00");
  photo(bob, "2026-12-12T12:15", "2026-12-12T09:10");
  photo(bob, null, "2026-12-12T09:10");
  photo(bob, "2026-12-11T20:00");
  photo(bob, "2026-12-13T10:00");
  // No time at all: placed by arrival, 02:00 UTC is 09:00 in Jakarta.
  photo(bob, null);
  const album = day.album(dina, invite.id);
  assert.equal(album.count, 7);
  assert.deepEqual(
    album.chapters.map((c) => [c.kind, c.title, c.photos.map((p) => p.takenAt.slice(11))]),
    [
      ["before", "", ["20:00"]],
      ["day", "Akad", ["08:00", "09:00", "09:10", "09:30"]],
      ["day", "Resepsi", ["12:15"]],
      ["after", "", ["10:00"]],
    ],
  );
});

test("likes lift a photo but only its owner sees the count; photographers come first", async () => {
  const { day, invite, photo, gatherings } = await setup();
  gatherings.join(cara, invite.id);
  const early = photo(bob, "2026-12-12T09:05");
  const loved = photo(cara, "2026-12-12T09:50");
  day.like(dina, invite.id, loved, { on: true });
  day.like(bob, invite.id, loved, { on: true });
  const order = (actor: { userId: string }) =>
    day.album(actor, invite.id).chapters[0]!.photos.map((p) => p.id);
  assert.deepEqual(order(bob), [loved, early]);
  const seen = (actor: { userId: string }) =>
    day.album(actor, invite.id).chapters[0]!.photos.find((p) => p.id === loved)!;
  assert.equal(seen(cara).likes, 2);
  assert.equal(seen(bob).likes, undefined);
  assert.equal(seen(bob).liked, true);
  rejects(() => day.setPhotographer(bob, invite.id, { userId: "bob", on: true }), "NOT_HOST");
  day.setPhotographer(dina, invite.id, { userId: "bob", on: true });
  assert.deepEqual(order(cara), [early, loved]);
  assert.equal(day.album(cara, invite.id).chapters[0]!.photos[0]!.photographer, true);
  // The photographer list never reaches the public invite.
  assert.equal("photographers" in gatherings.invite(invite.id), false);
});

test("'for you' holds your photos, photos of you and your small group's; tags and removal", async () => {
  const { day, invite, photo, gatherings } = await setup();
  gatherings.join(cara, invite.id);
  const bobs = photo(bob, null);
  const caras = photo(cara, null);
  const forYou = (actor: { userId: string }) =>
    day
      .album(actor, invite.id)
      .chapters.flatMap((c) => c.photos)
      .filter((p) => p.forYou)
      .map((p) => p.id);
  assert.deepEqual(forYou(dina), []);
  // Cara cannot tag Dina in Bob's photo, but can tag herself; Bob tags Dina in his own.
  rejects(() => day.tag(cara, invite.id, bobs, { userId: "dina", on: true }), "NOT_YOURS");
  day.tag(cara, invite.id, bobs, { userId: "cara", on: true });
  day.tag(bob, invite.id, bobs, { userId: "dina", on: true });
  rejects(() => day.tag(bob, invite.id, bobs, { userId: "stranger", on: true }), "NOT_A_MEMBER");
  assert.deepEqual(forYou(dina), [bobs]);
  assert.deepEqual(forYou(cara).sort(), [bobs, caras].sort());
  gatherings.createGroup(bob, invite.id, { name: "Geng", members: ["cara"] });
  assert.deepEqual(forYou(bob).sort(), [bobs, caras].sort());
  rejects(() => day.removePhoto(cara, invite.id, bobs), "NOT_YOURS");
  day.removePhoto(dina, invite.id, caras);
  assert.equal(day.album(bob, invite.id).count, 1);
});

test("wishes, members only, and accounts and moments take their photos with them", async () => {
  const { store, day, invite, photo, gatherings } = await setup();
  day.wish(bob, invite.id, { text: "Selamat!" });
  day.wish(bob, invite.id, { text: "Selamat menempuh hidup baru!" });
  assert.deepEqual(
    day.album(dina, invite.id).wishes.map((w) => [w.from.name, w.text]),
    [["Bob", "Selamat menempuh hidup baru!"]],
  );
  rejects(() => day.album(cara, invite.id), "NOT_FOUND");
  const id = photo(bob, null);
  rejects(() => day.file(cara, invite.id, id, true), "NOT_FOUND");
  const file = day.file(dina, invite.id, id, true);
  assert.equal(existsSync(file), true);
  // Blocked people's photos and wishes drop out.
  gatherings.peopleFilter = (viewer, user) => !(viewer === "dina" && user === "bob");
  assert.equal(day.album(dina, invite.id).count, 0);
  assert.equal(day.album(dina, invite.id).wishes.length, 0);
  rejects(() => day.file(dina, invite.id, id, true), "NOT_FOUND");
  gatherings.peopleFilter = () => true;
  store.transaction(() => day.erase("bob"));
  assert.equal(existsSync(file), false);
  assert.equal(day.album(dina, invite.id).wishes.length, 0);
  photo(dina, null);
  day.door(dina, invite.id);
  gatherings.remove(dina, invite.id);
  for (const kind of ["gathering-photo", "gathering-wish", "gathering-door", "gathering-checkin"])
    assert.equal(store.all(kind).length, 0, kind);
});

test("the camera's time is read from EXIF", () => {
  // A minimal big-endian TIFF: IFD0 points to an Exif IFD holding DateTimeOriginal.
  const tiff = Buffer.alloc(80);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x8769, 10);
  tiff.writeUInt16BE(4, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18);
  tiff.writeUInt16BE(1, 26);
  tiff.writeUInt16BE(0x9003, 28);
  tiff.writeUInt16BE(2, 30);
  tiff.writeUInt32BE(20, 32);
  tiff.writeUInt32BE(44, 36);
  tiff.write("2026:12:12 09:41:07\0", 44, "latin1");
  assert.equal(exifTakenAt(tiff), "2026-12-12T09:41");
  assert.equal(
    exifTakenAt(Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff])),
    "2026-12-12T09:41",
  );
  assert.equal(exifTakenAt(Buffer.from("nonsense")), null);
});

// Closing the moment (ADR 0039) ----------------------------------------------------------------
test("the album locks three days after the day, or when the host locks it; likes still work", async () => {
  const { gatherings, day, invite, photo, tick } = await setup();
  assert.equal(gatherings.invite(invite.id).phase, "live");
  const id = photo(bob, null);
  assert.equal(day.album(bob, invite.id).locksAfter, "2026-12-15");
  // 23:59 on the 15th in Jakarta is still open; the 16th is not.
  tick(Date.parse("2026-12-15T16:59:00Z") - Date.parse("2026-12-12T02:00:00Z"));
  assert.equal(day.album(bob, invite.id).phase, "live");
  tick(60_000);
  assert.equal(gatherings.invite(invite.id).phase, "closed");
  rejects(() => photo(bob, null), "ALBUM_LOCKED");
  rejects(() => day.wish(bob, invite.id, { text: "Telat" }), "ALBUM_LOCKED");
  rejects(() => day.tag(bob, invite.id, id, { userId: "bob", on: true }), "ALBUM_LOCKED");
  day.like(dina, invite.id, id, { on: true });
  // The poster can still take their own photo down.
  day.removePhoto(bob, invite.id, id);
});

test("the host thanks, locks early, picks a cover and reorders, and the link shows the thanks", async () => {
  const { gatherings, day, invite, photo } = await setup();
  const first = photo(bob, "2026-12-12T09:10");
  const second = photo(bob, "2026-12-12T09:20");
  rejects(() => day.close(bob, invite.id, { lock: true }), "NOT_HOST");
  day.close(dina, invite.id, { thanks: "Terima kasih sudah datang!", lock: true });
  const view = gatherings.invite(invite.id);
  assert.equal(view.phase, "closed");
  assert.equal(view.thanks, "Terima kasih sudah datang!");
  assert.equal(view.cover, false);
  rejects(() => day.coverFile(invite.id), "NOT_FOUND");
  day.setCover(dina, invite.id, { photoId: second });
  assert.equal(gatherings.invite(invite.id).cover, true);
  assert.match(day.coverFile(invite.id), /-s\.jpg$/);
  const order = () => day.album(bob, invite.id).chapters[0]!.photos.map((p) => p.id);
  assert.deepEqual(order(), [first, second]);
  rejects(() => day.move(bob, invite.id, second, { direction: "up" }), "NOT_HOST");
  day.move(dina, invite.id, second, { direction: "up" });
  assert.deepEqual(order(), [second, first]);
  day.move(dina, invite.id, second, { direction: "up" });
  assert.deepEqual(order(), [second, first]);
  // Taking the cover down takes it off the cards too.
  day.removePhoto(bob, invite.id, second);
  assert.equal(gatherings.invite(invite.id).cover, false);
  for (const hidden of ["lockedAt", "albumOrder", "coverPhotoId"])
    assert.equal(hidden in gatherings.invite(invite.id), false);
});

test("everyone who came gets a memory card once the moment closes, and can hide it", async () => {
  const { day, invite } = await setup();
  const { pass } = day.exchange(invite.id, { code: day.door(dina, invite.id).code });
  day.checkin(cara, invite.id, { pass });
  // Bob joined from the link but never came through the door: no card.
  assert.deepEqual(day.cards(bob, "cara"), []);
  day.close(dina, invite.id, { lock: true });
  const cards = day.cards(bob, "cara");
  assert.deepEqual(
    cards.map((c) => [c.title, c.people, c.host]),
    [["Dina & Raka", 1, false]],
  );
  assert.equal(day.cards(bob, "bob").length, 0);
  assert.equal(day.cards(bob, "dina")[0]!.host, true);
  assert.equal(day.album(cara, invite.id).card, "shown");
  assert.equal(day.album(bob, invite.id).card, undefined);
  rejects(() => day.setCard(bob, invite.id, { shown: false }), "NOT_FOUND");
  day.setCard(cara, invite.id, { shown: false });
  assert.equal(day.album(cara, invite.id).card, "hidden");
  assert.deepEqual(day.cards(bob, "cara"), []);
  day.setCard(cara, invite.id, { shown: true });
  // A private account's cards follow its posts: the server installs the rule.
  day.cardFilter = (viewer, user) => viewer === user;
  assert.deepEqual(day.cards(bob, "cara"), []);
  assert.equal(day.cards(cara, "cara").length, 1);
});

test("the test report counts answers, accounts, photos and guests' own moments, with no names", async () => {
  const { store, gatherings, day, invite, photo } = await setup();
  gatherings.respond(bob, invite.id, {
    name: "Bob",
    phone: "0811 0000 0001",
    attending: true,
    guests: 2,
  });
  gatherings.respond({ userId: GUEST }, invite.id, {
    name: "Tante Sri",
    phone: "0812 3456 7890",
    attending: false,
  });
  store.transaction(() =>
    store.put("credential", "bob", { userId: "bob", createdAt: "2026-12-12T03:00:00Z" }),
  );
  const { pass } = day.exchange(invite.id, { code: day.door(dina, invite.id).code });
  day.checkin(bob, invite.id, { pass });
  photo(bob, null);
  photo(bob, null);
  day.wish(bob, invite.id, { text: "Selamat!" });
  gatherings.create(bob, {
    kind: "wedding",
    title: "Bob & Ani",
    date: "2027-05-01",
    place: "Bogor",
  });
  const report = momentReport(store, invite.id, 4);
  assert.deepEqual(
    { ...report, title: undefined },
    {
      title: undefined,
      date: "2026-12-12",
      invited: 4,
      answers: 2,
      attending: 1,
      heads: 2,
      answeredSignedIn: 1,
      members: 1,
      arrived: 1,
      newAccounts: 1,
      uploaders: 1,
      photos: 2,
      wishes: 1,
      ownMoments: 1,
    },
  );
  const text = formatMomentReport(report).join("\n");
  assert.match(text, /Answered the RSVP: 2 \(50%\)/);
  assert.equal(/Bob|Sri|0812|890/.test(text), false);
});
