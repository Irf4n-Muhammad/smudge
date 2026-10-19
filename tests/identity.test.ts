import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { countryAt, jpegGps, placeAt } from "../packages/core/src/exif.js";
import { renderMoment } from "../apps/server/moments.js";
import { decorations } from "../packages/contracts/src/identity.js";
import { pieceDepth, themeBand } from "../packages/contracts/src/themes.js";

const alice = { userId: "alice" },
  bob = { userId: "bob" },
  eve = { userId: "eve" },
  leo = { userId: "leo" };

async function setup(date = "2026-03-10T10:00:00Z") {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-id-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["alice", "bob", "eve", "leo", "maya", "ines"])
      store.put("user", id, { id, name: id[0]!.toUpperCase() + id.slice(1), handle: id });
  });
  const clock = { now: new Date(date) };
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment, () => clock.now);
  return { store, social, identity, clock };
}
const code = (identity: IdentityService, actor: { userId: string }) =>
  identity.outbox(actor)[0]!.body.match(/\d{6}/)![0];
async function graduate(identity: IdentityService, actor: { userId: string }, email: string) {
  const { challengeId } = identity.startEmail(actor, { email });
  return identity.confirmEmail(actor, {
    challengeId,
    code: code(identity, actor),
    role: "Graduate",
    period: { from: 2022, to: 2026 },
  });
}
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

/** Minimal JPEG whose EXIF GPS block points at the given coordinates (big-endian TIFF). */
function jpegAt(lat: number, lon: number) {
  const tiff = Buffer.alloc(200);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x8825, 10);
  tiff.writeUInt16BE(4, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18);
  tiff.writeUInt32BE(0, 22);
  const gps = 26;
  tiff.writeUInt16BE(4, gps);
  const entry = (i: number, tag: number, type: number, count: number, value: Buffer | number) => {
    const at = gps + 2 + i * 12;
    tiff.writeUInt16BE(tag, at);
    tiff.writeUInt16BE(type, at + 2);
    tiff.writeUInt32BE(count, at + 4);
    if (typeof value === "number") tiff.writeUInt32BE(value, at + 8);
    else value.copy(tiff, at + 8);
  };
  const rational = (at: number, deg: number) => {
    const d = Math.floor(deg),
      m = Math.floor((deg - d) * 60),
      s = Math.round(((deg - d) * 60 - m) * 60 * 100);
    [d, 1, m, 1, s, 100].forEach((v, i) => tiff.writeUInt32BE(v, at + i * 4));
  };
  entry(0, 1, 2, 2, Buffer.from(lat < 0 ? "S\0" : "N\0"));
  entry(1, 2, 5, 3, 100);
  entry(2, 3, 2, 2, Buffer.from(lon < 0 ? "W\0" : "E\0"));
  entry(3, 4, 5, 3, 130);
  rational(100, Math.abs(lat));
  rational(130, Math.abs(lon));
  const app1 = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(app1.length + 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    length,
    app1,
    Buffer.from([0xff, 0xd9]),
  ]);
}

test("campus email verification creates a chapter, once per address, with private codes", async () => {
  const { identity } = await setup();
  rejects(() => identity.startEmail(alice, { email: "a@gmail.com" }), "EMAIL_DOMAIN_UNKNOWN");
  const { challengeId } = identity.startEmail(alice, { email: "Alice@student.lembayung.edu" });
  assert.equal(identity.outbox(bob).length, 0, "codes are only visible to the requester");
  rejects(
    () => identity.confirmEmail(bob, { challengeId, code: "000000", role: "Graduate" }),
    "NOT_FOUND",
  );
  const right = code(identity, alice);
  const wrong = right === "111111" ? "222222" : "111111";
  rejects(
    () => identity.confirmEmail(alice, { challengeId, code: wrong, role: "Graduate" }),
    "CODE_INCORRECT",
  );
  const chapter = identity.confirmEmail(alice, { challengeId, code: right, role: "Graduate" });
  assert.equal(chapter.kind, "education");
  assert.equal(chapter.label, "Graduate, Lembayung University");
  assert.equal(chapter.audience, "circle");
  rejects(
    () => identity.confirmEmail(alice, { challengeId, code: right, role: "Graduate" }),
    "NOT_FOUND",
  );
  rejects(() => identity.startEmail(bob, { email: "alice@student.lembayung.edu" }), "EMAIL_IN_USE");
  assert.deepEqual(identity.chaptersFor(bob, "alice"), [], "circle chapters stay private");
});

test("moment templates are locked by proof and circle moments are hidden outside the circle", async () => {
  const { identity, social } = await setup();
  const locked = identity.templates(alice).find((t) => t.kind === "graduation")!;
  assert.equal(locked.unlocked, false);
  rejects(
    () => identity.createMoment(alice, { kind: "graduation", title: "Done" }),
    "MOMENT_LOCKED",
  );
  const chapter = await graduate(identity, alice, "alice@student.lembayung.edu");
  rejects(
    () => identity.createMoment(bob, { kind: "graduation", chapterId: chapter.id, title: "Mine" }),
    "MOMENT_LOCKED",
  );
  const { post } = identity.createMoment(alice, {
    kind: "graduation",
    chapterId: chapter.id,
    title: "Finally",
    sections: [{ heading: "<b>First</b> day", text: "x" }],
  });
  const html = post.package.files["index.html"]!;
  assert.ok(html.includes("&lt;b&gt;First&lt;/b&gt; day"), "user text is escaped");
  assert.ok(!/verified/i.test(html), "the proof mark is host-drawn, not copyable source");
  assert.equal(
    social.feed(bob).some((p) => p.id === post.id),
    false,
  );
  rejects(() => social.visiblePost(bob, post.id), "NOT_FOUND");
  rejects(() => identity.react(bob, post.id, { sticker: "congrats" }), "NOT_FOUND");
  social.follow(alice, "bob");
  assert.equal(
    social.feed(bob).some((p) => p.id === post.id),
    false,
    "one-way follow is not circle",
  );
  social.follow(bob, "alice");
  const seen = identity.decorate(bob, social.feed(bob)).find((p) => p.id === post.id)!;
  assert.equal(seen.moment?.verified, true);
  assert.equal(seen.moment?.proof, "Graduate, Lembayung University");
  assert.equal(seen.hideCounts, true);
  const own = identity.decorate(alice, social.feed(alice)).find((p) => p.id === post.id)!;
  assert.equal(own.hideCounts, false);
});

test("reactions are preset stickers, one per person, replaceable and removable", async () => {
  const { identity } = await setup();
  const chapter = await graduate(identity, alice, "alice@lembayung.edu");
  const { post } = identity.createMoment(alice, {
    kind: "graduation",
    chapterId: chapter.id,
    title: "Done",
    audience: "public",
  });
  rejects(
    () => identity.react(bob, post.id, { sticker: "anything I want" }),
    "STICKER_NOT_ALLOWED",
  );
  rejects(() => identity.react(bob, post.id, { sticker: "pumpkin" }), "STICKER_NOT_ALLOWED");
  identity.react(bob, post.id, { sticker: "congrats" });
  let state = identity.react(bob, post.id, { sticker: "proud" });
  assert.deepEqual(state.counts, { proud: 1 });
  assert.equal(state.mine, "proud");
  identity.react(eve, post.id, { sticker: "proud" });
  state = identity.react(bob, post.id, { sticker: null });
  assert.deepEqual(state.counts, { proud: 1 });
  assert.equal(state.mine, null);
  assert.deepEqual(
    state.wall.map((w) => w.name),
    ["Eve"],
  );
});

test("birthday template opens only around the stored date, which cannot be changed", async () => {
  const { identity, clock } = await setup("2026-03-10T10:00:00Z");
  identity.setBirthday(alice, { birthday: "03-11" });
  rejects(() => identity.setBirthday(alice, { birthday: "03-10" }), "BIRTHDAY_LOCKED");
  assert.equal(identity.templates(alice).find((t) => t.kind === "birthday")!.unlocked, true);
  clock.now = new Date("2026-03-14T10:00:00Z");
  assert.equal(identity.templates(alice).find((t) => t.kind === "birthday")!.unlocked, false);
  rejects(() => identity.createMoment(alice, { kind: "birthday", title: "HBD" }), "MOMENT_LOCKED");
  clock.now = new Date("2027-03-11T01:00:00Z");
  const { moment } = identity.createMoment(alice, { kind: "birthday", title: "HBD" });
  assert.equal(moment!.proof, "Birthday, 2027-03-11");
});

test("together needs the partner's own confirmation and ends for both", async () => {
  const { identity, social } = await setup();
  const request = identity.requestPartner(alice, { partnerId: "bob", label: "Married" });
  rejects(() => identity.respondPartner(alice, request.id, true), "PARTNER_MUST_CONFIRM");
  rejects(() => identity.respondPartner(eve, request.id, true), "NOT_FOUND");
  identity.respondPartner(bob, request.id, true);
  const mine = identity.me(alice).chapters.find((c) => c.kind === "together")!;
  assert.equal(mine.label, "Married with Bob");
  assert.equal(
    identity.me(bob).chapters.find((c) => c.kind === "together")!.label,
    "Married with Alice",
  );
  const { post } = identity.createMoment(alice, {
    kind: "together",
    chapterId: mine.id,
    title: "Us",
    audience: "public",
  });
  const theirs = identity.me(bob).chapters.find((c) => c.kind === "together")!;
  identity.removeChapter(bob, theirs.id);
  assert.equal(identity.me(alice).chapters.length, 0, "ending it removes both chapters");
  const view = identity.decorate(eve, social.feed(eve)).find((p) => p.id === post.id)!;
  assert.equal(view.moment?.verified, false, "old moments stay but lose their proof");
});

test("organisation invites are issued by admins and redeemed once", async () => {
  const { identity } = await setup();
  rejects(
    () => identity.createInvite(alice, { orgId: "teater-senja", kind: "member", label: "Member" }),
    "ORG_ADMIN_REQUIRED",
  );
  const invite = identity.createInvite(leo, {
    orgId: "film-fest",
    kind: "title",
    label: "Winner, Lembayung Film Festival 2025",
    uses: 1,
  });
  assert.match(invite.code, /^[A-Z0-9]{10}$/);
  const chapter = identity.redeemInvite(alice, { code: invite.code.toLowerCase() });
  assert.equal(chapter.kind, "title");
  rejects(() => identity.redeemInvite(alice, { code: invite.code }), "INVITE_ALREADY_USED");
  rejects(() => identity.redeemInvite(bob, { code: invite.code }), "INVITE_EXHAUSTED");
  assert.equal(identity.templates(alice).find((t) => t.kind === "milestone")!.unlocked, true);
});

test("travel proof reads the photo's GPS; photos without location are refused", async () => {
  const { identity, social } = await setup();
  assert.equal(countryAt(1.29, 103.85), "SG", "smaller boxes win over overlapping neighbours");
  assert.equal(countryAt(-6.2, 106.8), "ID");
  assert.deepEqual(
    Object.values(jpegGps(jpegAt(35.68, 139.69))!).map((v) => Math.round(v * 100) / 100),
    [35.68, 139.69],
  );
  const tokyo = social.upload(alice, {
    name: "tokyo.jpg",
    mime: "image/jpeg",
    base64: jpegAt(35.68, 139.69).toString("base64"),
  });
  rejects(() => identity.travelProof(bob, { assetId: tokyo.id }), "NOT_FOUND");
  const chapter = identity.travelProof(alice, { assetId: tokyo.id });
  assert.equal(chapter.label, "Been to Japan");
  assert.equal(identity.travelProof(alice, { assetId: tokyo.id }).id, chapter.id);
  const plain = social.upload(alice, {
    name: "plain.jpg",
    mime: "image/jpeg",
    base64: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64"),
  });
  rejects(() => identity.travelProof(alice, { assetId: plain.id }), "PHOTO_HAS_NO_LOCATION");
});

test("seasons apply a default, allow a manual choice per season, and members themes need proof", async () => {
  const { identity, social, clock } = await setup("2026-10-20T10:00:00Z");
  let state = identity.decorations(alice);
  assert.deepEqual(state.current, { id: "pumpkin-night", source: "season-default" });
  identity.chooseDecoration(alice, { decorationId: "bats", scope: "season" });
  assert.equal(identity.decorations(alice).current.id, "bats");
  rejects(
    () => identity.chooseDecoration(alice, { decorationId: "bats", scope: "base" }),
    "SEASONAL_NOT_PERMANENT",
  );
  rejects(
    () => identity.chooseDecoration(alice, { decorationId: "lembayung-pennants", scope: "base" }),
    "DECORATION_LOCKED",
  );
  await graduate(identity, alice, "alice@student.lembayung.edu");
  identity.chooseDecoration(alice, { decorationId: "lembayung-pennants", scope: "base" });
  identity.chooseDecoration(alice, { decorationId: null, scope: "season" });
  assert.equal(identity.decorations(alice).current.id, "lembayung-pennants", "opted out of season");
  clock.now = new Date("2026-08-15T10:00:00Z");
  assert.equal(identity.decorations(alice).current.id, "lembayung-pennants", "no country set");
  identity.setCountry(alice, { country: "ID" });
  assert.equal(identity.decorations(alice).current.id, "merah-putih", "local date for Indonesia");
  clock.now = new Date("2027-10-20T10:00:00Z");
  assert.equal(identity.decorations(alice).current.id, "pumpkin-night", "choice resets yearly");
  clock.now = new Date("2027-01-01T10:00:00Z");
  state = identity.decorations(bob);
  assert.equal(state.season?.key, "new-year:2026", "wrapping season keeps its start year");
  identity.chooseDecoration(bob, { decorationId: "fireworks", scope: "season" });
  const post = social.publish(
    bob,
    social.createDraft(bob, {
      package: {
        manifest: {
          schemaVersion: 1,
          runtimeVersion: "web-v1",
          name: "x",
          entrypoint: "index.html",
          capabilities: [],
        },
        files: { "index.html": "<p>x</p>" },
      },
      metadata: { title: "x" },
    }).id,
    1,
  );
  const view = identity.decorate(alice, social.feed(alice)).find((p) => p.id === post.id)!;
  assert.equal(view.decoration?.id, "fireworks");
  assert.deepEqual(
    view.reactions.options.map((o) => o.id),
    ["firework", "spark", "heart"],
  );
});

test("a proven trip opens its event themes, which the profile and feed both wear", async () => {
  const { identity, social } = await setup("2026-03-10T10:00:00Z");
  const paris = () => identity.decorations(alice).items.find((d) => d.id === "paris")!;
  assert.equal(paris().unlocked, false);
  assert.equal(paris().event, "Trip to France");
  rejects(
    () => identity.chooseDecoration(alice, { decorationId: "paris", scope: "base" }),
    "DECORATION_LOCKED",
  );
  const tokyo = social.upload(alice, {
    name: "tokyo.jpg",
    mime: "image/jpeg",
    base64: jpegAt(35.68, 139.69).toString("base64"),
  });
  identity.travelProof(alice, { assetId: tokyo.id });
  assert.equal(paris().unlocked, false, "another country does not open it");
  const photo = social.upload(alice, {
    name: "paris.jpg",
    mime: "image/jpeg",
    base64: jpegAt(48.86, 2.35).toString("base64"),
  });
  const chapter = identity.travelProof(alice, { assetId: photo.id });
  assert.equal(paris().unlocked, true);
  // Unlike a season, a trip theme can be someone's everyday look.
  identity.chooseDecoration(alice, { decorationId: "paris", scope: "base" });
  assert.deepEqual(
    { ...identity.themeFor(bob, "alice"), pieces: undefined },
    {
      id: "paris",
      name: "Paris",
      accent: "#1f3a5f",
      font: "serif",
      tier: "event",
      event: "Trip to France",
      creator: "ines",
      pieces: undefined,
    },
  );
  const post = social.publish(
    alice,
    social.createDraft(alice, {
      package: {
        manifest: {
          schemaVersion: 1,
          runtimeVersion: "web-v1",
          name: "x",
          entrypoint: "index.html",
          capabilities: [],
        },
        files: { "index.html": "<p>x</p>" },
      },
      metadata: { title: "x" },
    }).id,
    1,
  );
  const view = identity.decorate(bob, social.feed(bob)).find((p) => p.id === post.id)!;
  assert.equal(view.decoration?.id, "paris");
  assert.equal(view.decoration?.font, "serif");
  // Removing the proof takes the theme off; the stored choice cannot outlive it.
  identity.removeChapter(alice, chapter.id);
  assert.equal(identity.themeFor(bob, "alice"), null);
  assert.equal(
    identity.decorate(bob, social.feed(bob)).find((p) => p.id === post.id)!.decoration,
    undefined,
  );
});

test("creator estimate weighs new adopters above old ones and defaults at half", async () => {
  const { identity, clock } = await setup("2026-03-10T10:00:00Z");
  identity.chooseDecoration(alice, { decorationId: "cat-peek", scope: "base" });
  clock.now = new Date("2026-05-09T10:00:00Z");
  identity.chooseDecoration(bob, { decorationId: "vines", scope: "base" });
  const maya = identity.earnings({ userId: "maya" });
  const ines = identity.earnings({ userId: "ines" });
  assert.equal(maya.decorations.find((d) => d.id === "cat-peek")!.weight, 0.25);
  assert.equal(ines.decorations.find((d) => d.id === "vines")!.weight, 1);
  assert.ok(ines.estimate > maya.estimate * 3);
  assert.equal(maya.estimate + ines.estimate, maya.creatorPot);
});

test("open signup creates distinct handles", async () => {
  const { identity } = await setup();
  const user = identity.signup({ name: "Salsa Bila", handle: "Salsa.bila" });
  assert.equal(user.handle, "salsa.bila");
  assert.equal(user.initials, "SB");
  rejects(() => identity.signup({ name: "Other", handle: "salsa.bila" }), "HANDLE_TAKEN");
});

test("theme pieces stay in a band along the edge, so the post underneath stays readable", () => {
  // The same rule community submissions are held to; buttons sit above pieces, never under.
  for (const d of decorations)
    for (const p of d.pieces)
      assert.ok(
        pieceDepth(p) <= themeBand,
        `${d.id} ${p.anchor} reaches ${pieceDepth(p)}px into the post`,
      );
});

test("a trip to a place opens its own theme, while the country alone does not", async () => {
  const { identity, social } = await setup("2026-03-10T10:00:00Z");
  assert.equal(placeAt(-8.65, 115.22), "bali", "Denpasar");
  assert.equal(placeAt(-8.17, 114.45), "bali", "Gilimanuk, on the west tip");
  assert.equal(placeAt(-8.58, 116.12), null, "Lombok is not Bali");
  assert.equal(placeAt(-8.22, 114.36), null, "Banyuwangi, across the strait");
  const item = (id: string) => identity.decorations(alice).items.find((d) => d.id === id)!;
  const prove = (name: string, lat: number, lon: number) =>
    identity.travelProof(alice, {
      assetId: social.upload(alice, {
        name,
        mime: "image/jpeg",
        base64: jpegAt(lat, lon).toString("base64"),
      }).id,
    });
  assert.equal(
    item("bali-frangipani").reason,
    "Trip to Bali. Prove it with a photo taken in Bali.",
  );
  const jakarta = prove("jakarta.jpg", -6.2, 106.8);
  assert.equal(jakarta.label, "Been to Indonesia");
  assert.equal(item("bali-frangipani").unlocked, false, "Indonesia is not Bali");
  const bali = prove("ubud.jpg", -8.51, 115.26);
  assert.equal(bali.label, "Been to Bali");
  assert.equal(bali.country, "ID");
  assert.notEqual(bali.id, jakarta.id);
  assert.equal(prove("kuta.jpg", -8.72, 115.17).id, bali.id, "one chapter per place");
  assert.equal(item("bali-frangipani").unlocked, true);
  assert.equal(item("sakura-gate").unlocked, false);
  prove("kyoto.jpg", 35.01, 135.77);
  assert.equal(item("sakura-gate").unlocked, true);
  assert.equal(item("sakura-gate").event, "Trip to Japan");
});
