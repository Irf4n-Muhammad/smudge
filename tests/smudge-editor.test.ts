import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService, AppError } from "../packages/core/src/social.js";
import { ProfileService } from "../packages/core/src/profiles.js";
import { CommunityService } from "../packages/core/src/community.js";
import { composeProfilePart } from "../packages/core/src/composition.js";
import { profileDocument, profilePackageSchema } from "../packages/contracts/src/profile.js";
import {
  applySmudgeSettings,
  defaultSmudgeSettings,
  emptyChapter as defaultChapter,
  readSmudgeSettings,
  supportsSmudgeDesign,
} from "../packages/core/src/smudge-design.js";
import { applyLook, lookKind, readLook } from "../packages/core/src/easy-look.js";
import { applyProfileDesign, defaultProfileDesign } from "../packages/core/src/profile-design.js";
import { smudgeProfilePackage } from "../apps/server/smudge-profile.js";
import { rakaPackage, basicPackage } from "../apps/server/raka.js";
import { profileTemplates } from "../apps/server/seed-profiles.js";

const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

test("easy-editor settings are ordinary source, round-trip, and grant the Wall only while it is shown", () => {
  const settings = {
    ...defaultSmudgeSettings,
    tagline: "*rolls* wherever it's flat.",
    palette: "electric" as const,
    sections: ["quote", "latest", "wall", "selected"] as const,
    now: { text: "Filming a skate part", place: "Osaka", progress: 60 },
  };
  const pkg = applySmudgeSettings(smudgeProfilePackage, {
    ...settings,
    sections: [...settings.sections],
  });
  assert.deepEqual(readSmudgeSettings(pkg).sections, ["quote", "latest", "wall", "selected"]);
  assert.equal(readSmudgeSettings(pkg).tagline, "*rolls* wherever it's flat.");
  assert.match(pkg.files["smudge/settings.js"]!, /^window\.smudgeSettings = /);
  // The look tells the app its colours (ADR 0049): the palette's second colour is the accent.
  const look = pkg.manifest.schemaVersion === 2 ? pkg.manifest.look : undefined;
  assert.equal(look?.accent, "#d8ff3d");
  assert.equal(look?.ground, "#0e0d0b");
  // The whole palette goes along as tints (ADR 0052); the default palette is Night.
  assert.deepEqual(look?.tints, ["#2b3cff", "#d8ff3d", "#ff4f9a", "#00c2ff"]);
  const night = applySmudgeSettings(smudgeProfilePackage, defaultSmudgeSettings);
  assert.equal(
    night.manifest.schemaVersion === 2 ? night.manifest.look?.accent : undefined,
    "#f2c53d",
  );
  assert.throws(() =>
    profilePackageSchema.parse({
      ...pkg,
      manifest: { ...pkg.manifest, look: { ...look, accent: "lime" } },
    }),
  );
  // The page carries no follow button of its own (ADR 0048): the app's strip has it.
  const caps = (list: readonly string[] | undefined) => list ?? [];
  assert.ok(!caps(pkg.manifest.capabilities).includes("profile.social.toggle"));
  const profilePart = pkg.manifest.schemaVersion === 2 ? pkg.manifest.parts.profile : undefined;
  assert.ok(!caps(profilePart?.capabilities).includes("profile.social.toggle"));
  // A ribbon from an older version is ignored; chapters are kept and checked.
  const withRibbon = structuredClone(pkg);
  withRibbon.files["smudge/settings.js"] = `window.smudgeSettings = ${JSON.stringify({
    ...readSmudgeSettings(pkg),
    marquee: "old & gone",
    chapters: [{ ...defaultChapter, kind: "run", title: "Slow, but *far*.", big: "1:52:10" }],
  })};`;
  assert.equal(readSmudgeSettings(withRibbon).chapters[0]?.big, "1:52:10");
  // A chapter's photo becomes one of the page's assets, and leaves with the chapter (ADR 0050).
  const photo = "10000000-0000-4000-8000-000000000001";
  const withPhoto = applySmudgeSettings(pkg, {
    ...readSmudgeSettings(pkg),
    chapters: [{ ...defaultChapter, kind: "work", title: "Walls", photo }],
  });
  assert.ok(withPhoto.manifest.assets.includes(photo));
  assert.match(
    withPhoto.files["smudge/settings.js"]!,
    /window\.smudgePhotos = \{"1000.*asset:1000/,
  );
  assert.equal(readSmudgeSettings(withPhoto).chapters[0]?.photo, photo);
  const without = applySmudgeSettings(withPhoto, {
    ...readSmudgeSettings(withPhoto),
    chapters: [],
  });
  assert.ok(!without.manifest.assets.includes(photo));
  // Snaps around a chapter and the roll are assets too, with their captions kept (ADR 0053).
  const snap = "10000000-0000-4000-8000-000000000002",
    rolled = "10000000-0000-4000-8000-000000000003";
  const withRoll = applySmudgeSettings(pkg, {
    ...readSmudgeSettings(pkg),
    chapters: [
      { ...defaultChapter, kind: "run", snaps: [{ photo: snap, caption: "Sentul, 05:40" }] },
    ],
    roll: [{ photo: rolled, caption: "Blok M, 2025" }],
  });
  assert.ok(withRoll.manifest.assets.includes(snap) && withRoll.manifest.assets.includes(rolled));
  assert.equal(readSmudgeSettings(withRoll).roll[0]?.caption, "Blok M, 2025");
  // The owner's words (ADR 0054) are kept and bounded.
  const words = applySmudgeSettings(pkg, {
    ...readSmudgeSettings(pkg),
    manifesto: "Skate since *fourteen.* Film since *college.*",
  });
  assert.match(readSmudgeSettings(words).manifesto, /^Skate since/);
  assert.throws(() =>
    applySmudgeSettings(pkg, { ...readSmudgeSettings(pkg), manifesto: "x".repeat(141) }),
  );
  assert.equal(readSmudgeSettings(withRoll).chapters[0]?.snaps[0]?.caption, "Sentul, 05:40");
  assert.throws(() =>
    applySmudgeSettings(pkg, {
      ...readSmudgeSettings(pkg),
      roll: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
        photo: `10000000-0000-4000-8000-00000000000${n}`,
        caption: "",
      })),
    }),
  );
  assert.throws(() =>
    applySmudgeSettings(pkg, {
      ...readSmudgeSettings(pkg),
      chapters: [{ ...defaultChapter, photo: "not-an-id" }],
    }),
  );
  assert.throws(() =>
    applySmudgeSettings(pkg, { ...settings, chapters: [1, 2, 3, 4].map(() => defaultChapter) }),
  );
  for (const cap of ["profile.wall.read", "profile.wall.add", "profile.wall.remove"])
    assert.ok((pkg.manifest.capabilities as string[]).includes(cap));
  const off = applySmudgeSettings(pkg, { ...readSmudgeSettings(pkg), sections: ["latest"] });
  assert.ok(!(off.manifest.capabilities as string[]).some((c) => c.startsWith("profile.wall.")));
  // Bad input is refused instead of written into the page.
  assert.throws(() => applySmudgeSettings(pkg, { ...settings, tagline: "x".repeat(61) }));
  assert.throws(() => applySmudgeSettings(pkg, { ...settings, sections: ["latest", "latest"] }));
  assert.throws(() => applySmudgeSettings(rakaPackage, defaultSmudgeSettings));
  assert.equal(supportsSmudgeDesign(rakaPackage), false);
  // A broken settings file falls back to defaults rather than breaking the editor.
  const broken = structuredClone(pkg);
  broken.files["smudge/settings.js"] = "window.smudgeSettings = {oops;";
  assert.deepEqual(readSmudgeSettings(broken), defaultSmudgeSettings);
});

test("an older Paint wall copy is brought up to date, keeping files already rewritten at this version", () => {
  const old = structuredClone(smudgeProfilePackage);
  old.files["index.html"] = old.files["index.html"]!.replace(
    /<script src="smudge\/(settings|sections)\.js"><\/script>\n/g,
    "",
  ).replace('<div class="sm-sections" id="sm-sections"></div>\n  ', "");
  delete old.files["smudge/sections.js"];
  old.files["smudge/profile.html"] = "<p>old hero</p>";
  old.files["smudge/post.html"] = "<!-- smudge:v10 --><p>my own grid</p>";
  const next = applySmudgeSettings(
    profilePackageSchema.parse(old),
    defaultSmudgeSettings,
    smudgeProfilePackage,
  );
  assert.equal(
    next.files["smudge/profile.html"],
    smudgeProfilePackage.files["smudge/profile.html"],
  );
  assert.equal(next.files["smudge/post.html"], "<!-- smudge:v10 --><p>my own grid</p>");
  assert.ok(next.files["smudge/sections.js"]);
  const shell = next.files["index.html"]!;
  assert.match(shell, /src="smudge\/settings\.js"/);
  assert.match(shell, /src="smudge\/sections\.js"/);
  assert.match(shell, /id="sm-sections"/);
  assert.match(profileDocument(next).files["index.html"]!, /class="hero"/);
});

test("Paint wall with settings still mixes with Ink & Paper within the file limit", () => {
  const easy = applySmudgeSettings(smudgeProfilePackage, defaultSmudgeSettings);
  const mixed = composeProfilePart(easy, rakaPackage, "feature");
  assert.ok(Object.keys(mixed.files).length <= 20);
  assert.ok(mixed.manifest.capabilities.includes("relay.add" as never));
  const other = composeProfilePart(rakaPackage, smudgeProfilePackage, "post");
  assert.ok(Object.keys(other.files).length <= 20);
});

test("the Wall: visitors add notes, authors and owners remove them, limits, blocks and draft isolation", async () => {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-wall-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["owner", "ana", "budi", "mod"])
      store.put("user", id, {
        id,
        name: id.toUpperCase(),
        handle: id,
        initials: "X",
        color: "#fff",
        bio: "",
      });
  });
  const social = new SocialService(store);
  const community = new CommunityService(social, (id) => id === "mod");
  const profiles = new ProfileService(social);
  const owner = { userId: "owner" },
    ana = { userId: "ana" },
    budi = { userId: "budi" };
  const pkg = applySmudgeSettings(smudgeProfilePackage, {
    ...defaultSmudgeSettings,
    sections: ["wall", "latest"],
  });
  const draft = profiles.create(owner, pkg);
  const live = profiles.publish(owner, draft.id, 1, 0).publicationId!;
  const note = (text = "Love this wall", tone = 0) => ({ submissionId: randomUUID(), text, tone });
  type View = { notes: { id: string; userId: string; name: string; removable: boolean }[] };
  const add = (who: { userId: string }, value = note()) =>
    profiles.capability(who, live, false, "profile.wall.add", value) as View;

  const first = add(ana);
  assert.equal(first.notes[0]!.name, "ANA");
  assert.equal(first.notes[0]!.removable, true);
  const seenByBudi = profiles.capability(budi, live, false, "profile.wall.read", undefined) as View;
  assert.equal(seenByBudi.notes[0]!.removable, false);
  // Same submission twice is one note; someone else reusing its id is refused.
  const again = note();
  add(budi, again);
  assert.equal(add(budi, again).notes.length, 2);
  rejects(() => add(ana, again), "SUBMISSION_CONFLICT");
  // Names come from the account, never from the frame.
  assert.throws(() => add(ana, { ...note(), name: "Someone else" } as never));
  assert.throws(() => add(ana, note("x".repeat(141))));
  // Budi can't remove Ana's note; the owner can.
  const anaNote = first.notes[0]!.id;
  rejects(
    () => profiles.capability(budi, live, false, "profile.wall.remove", { noteId: anaNote }),
    "FORBIDDEN",
  );
  const afterOwner = profiles.capability(owner, live, false, "profile.wall.remove", {
    noteId: anaNote,
  }) as View;
  assert.equal(afterOwner.notes.length, 1);
  // Five notes each.
  for (let i = 0; i < 4; i++) add(budi);
  rejects(() => add(budi), "WALL_NOTE_LIMIT");
  // Blocked people can't write on the wall.
  community.block(owner, "ana");
  assert.throws(
    () => add(ana),
    (e: unknown) => e instanceof AppError,
  );
  // A draft preview writes on its own wall, never the live one.
  profiles.capability(owner, draft.id, true, "profile.wall.add", note("trying it"));
  const liveNotes = profiles.capability(owner, live, false, "profile.wall.read", undefined) as View;
  assert.ok(!liveNotes.notes.some((n) => n.userId === "owner"));
  // Turning the Wall off in a later publication closes the old one too.
  const off = profiles.create(
    owner,
    applySmudgeSettings(pkg, { ...defaultSmudgeSettings, sections: ["latest"] }),
  );
  profiles.publish(owner, off.id, 1, 1);
  rejects(
    () => profiles.capability(budi, live, false, "profile.wall.read", undefined),
    "CAPABILITY_DENIED",
  );
  // Deleting an account takes its notes off every wall.
  const before = store.get<{ userId: string }[]>("profile-wall", "owner:owner")!;
  assert.ok(before.some((n) => n.userId === "budi"));
  store.transaction(() => community.erase("budi"));
  const after = store.get<{ userId: string }[]>("profile-wall", "owner:owner")!;
  assert.ok(!after.some((n) => n.userId === "budi"));
});

test("Room and Comic get easy colours and a big line as ordinary source; Ink & Paper parts are tappable", () => {
  const room = profileTemplates.room;
  const comic = profileTemplates.comic;
  assert.equal(lookKind(room), "room");
  assert.equal(lookKind(comic), "comic");
  assert.equal(lookKind(smudgeProfilePackage), null);
  assert.deepEqual(readLook(room), { tint: "cream", line: "" });
  const tinted = applyLook(room, { tint: "sage", line: "things I <3" });
  assert.deepEqual(readLook(tinted), { tint: "sage", line: "things I <3" });
  // The line can never close the script it lives in.
  assert.ok(!tinted.files["index.html"]!.includes("things I <3"));
  assert.match(tinted.files["index.html"]!, /--wall:#c9d3bd/);
  // Applying again replaces the block instead of stacking another.
  const again = applyLook(tinted, { tint: "rose", line: "" });
  assert.equal(again.files["index.html"]!.match(/smudge-look:start/g)!.length, 1);
  assert.equal(
    again.files["index.html"]!.replace(
      /<!-- smudge-look:start -->[\s\S]*?<!-- smudge-look:end -->\n/,
      "",
    ),
    room.files["index.html"],
  );
  assert.throws(() => applyLook(comic, { tint: "sage", line: "" }));
  assert.throws(() => applyLook(room, { tint: "sage", line: "x".repeat(61) }));
  assert.throws(() => applyLook(smudgeProfilePackage, { tint: "red", line: "" }));
  // Ink & Paper and Essentials mark their parts for tap-to-edit.
  for (const base of [rakaPackage, basicPackage]) {
    const boot = applyProfileDesign(base, defaultProfileDesign).files["personal/boot.js"]!;
    for (const field of ['"about"', '"story"', '"post"', '"feature"', 'dataset.edit = "photo"'])
      assert.ok(boot.includes(field), field);
  }
});

test("wall notes can be reported: hidden for the reporter, queued for moderators, removable", async () => {
  const store = await Store.open(
    join(mkdtempSync(join(tmpdir(), "forma-wall-report-")), "db.sqlite"),
  );
  store.transaction(() => {
    for (const id of ["owner", "ana", "budi", "mod"])
      store.put("user", id, {
        id,
        name: id.toUpperCase(),
        handle: id,
        initials: "X",
        color: "#fff",
        bio: "",
      });
  });
  const social = new SocialService(store);
  const community = new CommunityService(social, (id) => id === "mod");
  const profiles = new ProfileService(social);
  const owner = { userId: "owner" },
    ana = { userId: "ana" },
    budi = { userId: "budi" },
    mod = { userId: "mod" };
  const pkg = applySmudgeSettings(smudgeProfilePackage, {
    ...defaultSmudgeSettings,
    sections: ["wall"],
  });
  const draft = profiles.create(owner, pkg);
  const live = profiles.publish(owner, draft.id, 1, 0).publicationId!;
  type View = { notes: { id: string; userId: string; reportable: boolean }[] };
  const read = (who: { userId: string }) =>
    profiles.capability(who, live, false, "profile.wall.read", undefined) as View;
  const added = profiles.capability(ana, live, false, "profile.wall.add", {
    submissionId: randomUUID(),
    text: "rude words",
    tone: 1,
  }) as View;
  const noteId = added.notes[0]!.id;
  assert.equal(added.notes[0]!.reportable, false);
  assert.equal(read(budi).notes[0]!.reportable, true);
  rejects(
    () => profiles.capability(ana, live, false, "profile.wall.report", { noteId }),
    "CANNOT_REPORT_OWN_NOTE",
  );
  assert.throws(() =>
    profiles.capability(budi, live, false, "profile.wall.report", { noteId, reason: "nope" }),
  );
  const after = profiles.capability(budi, live, false, "profile.wall.report", {
    noteId,
    reason: "harassment",
  }) as View;
  // Gone for Budi straight away, still there for everyone else until a moderator decides.
  assert.equal(after.notes.length, 0);
  assert.equal(read(owner).notes.length, 1);
  // Reporting needs no grant of its own, and draft walls can't be reported.
  assert.ok(!(pkg.manifest.capabilities as string[]).includes("profile.wall.report"));
  const preview = profiles.capability(owner, draft.id, true, "profile.wall.add", {
    submissionId: randomUUID(),
    text: "draft",
    tone: 0,
  }) as View;
  assert.throws(() =>
    profiles.capability(owner, draft.id, true, "profile.wall.report", {
      noteId: preview.notes[0]!.id,
    }),
  );
  const queue = community.reports(mod) as {
    target: string;
    id: string;
    caption: string;
    reasons: Record<string, number>;
  }[];
  const item = queue.find((r) => r.target === "wall-note")!;
  assert.equal(item.id, `owner:${noteId}`);
  assert.equal(item.caption, "rude words");
  assert.deepEqual(item.reasons, { harassment: 1 });
  rejects(
    () => community.moderate(budi, { target: "wall-note", id: item.id, action: "remove" }),
    "NOT_FOUND",
  );
  community.moderate(mod, { target: "wall-note", id: item.id, action: "remove" });
  assert.equal(read(owner).notes.length, 0);
  assert.ok(
    !(community.reports(mod) as { target: string }[]).some((r) => r.target === "wall-note"),
  );
  // Deleting the reporter's account clears their reports.
  store.transaction(() => community.erase("budi"));
  assert.equal(store.all("wall-report").length, 0);
});
