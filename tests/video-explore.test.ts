import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { MediaService } from "../packages/core/src/media.js";
import { buildPost, startPostDesign } from "../packages/core/src/easy-post.js";

const jpeg = Buffer.from([255, 216, 255, 224, 0, 16]).toString("base64");
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(32)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(32)]);

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "forma-video-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  store.transaction(() => {
    for (const id of ["ana", "budi", "citra"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
  });
  const social = new SocialService(store);
  const media = new MediaService(social, join(dir, "media"));
  return { store, social, media };
}
const as = (userId: string) => ({ userId });
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

test("videos are checked, kept as files outside the database, and copied for reuse", async () => {
  const { store, social, media } = await setup();
  const v = media.uploadVideo(as("ana"), { name: "clip.mp4", mime: "video/mp4", bytes: mp4 });
  assert.ok(existsSync(media.path(v.id)));
  assert.deepEqual(readFileSync(media.path(v.id)), mp4);
  assert.equal(store.get<{ base64: string }>("asset", v.id)!.base64, "");
  assert.ok(media.uploadVideo(as("ana"), { name: "a", mime: "video/webm", bytes: webm }).id);
  rejects(
    () => media.uploadVideo(as("ana"), { name: "x", mime: "video/webm", bytes: mp4 }),
    "INVALID_VIDEO",
  );
  assert.throws(() => media.uploadVideo(as("ana"), { name: "x", mime: "image/gif", bytes: mp4 }));
  rejects(
    () =>
      media.uploadVideo(as("ana"), {
        name: "big",
        mime: "video/mp4",
        bytes: Buffer.concat([mp4, Buffer.alloc(30_000_001)]),
      }),
    "VIDEO_TOO_LARGE",
  );
  rejects(
    () => media.uploadVideo(as("nobody"), { name: "x", mime: "video/mp4", bytes: mp4 }),
    "UNAUTHENTICATED",
  );
  const copy = media.copyVideo(as("budi"), social.asset(as("ana"), v.id));
  assert.equal(social.asset(as("budi"), copy).ownerId, "budi");
  assert.deepEqual(readFileSync(media.path(copy)), mp4);
  assert.throws(() => media.path("../forma.sqlite"));
});

test("an easy post plays a video with its poster frame as photo and cover", async () => {
  const { social, media } = await setup();
  const video = media.uploadVideo(as("ana"), { name: "c", mime: "video/mp4", bytes: mp4 });
  const poster = social.upload(as("ana"), { name: "p.jpg", mime: "image/jpeg", base64: jpeg });
  for (const style of ["poster", "gallery", "magazine"] as const) {
    const design = {
      ...startPostDesign(style),
      photos: [{ assetId: poster.id, caption: "Rain <3", videoAssetId: video.id }],
    };
    const built = buildPost(design);
    const html = built.package.files["index.html"]!;
    assert.match(html, new RegExp(`<video src="asset:${video.id}" poster="asset:${poster.id}"`));
    assert.match(html, /Rain &lt;3/);
    assert.deepEqual(built.package.manifest.assets.sort(), [poster.id, video.id].sort());
    assert.equal(built.metadata.coverAssetId, poster.id);
    assert.equal(!!built.package.files["video.js"], style === "poster");
    const draft = social.createDraft(as("ana"), {
      ...built,
      metadata: { ...built.metadata, caption: "", contributors: [] },
    });
    assert.ok(social.publish(as("ana"), draft.id, 1).id);
  }
  // A video can never be a post's cover image.
  const design = { ...startPostDesign("note"), photos: [] };
  const built = buildPost(design);
  built.package.manifest.assets.push(video.id);
  rejects(
    () =>
      social.createDraft(as("ana"), {
        package: built.package,
        metadata: { ...built.metadata, coverAssetId: video.id, caption: "", contributors: [] },
      }),
    "COVER_NOT_IMAGE",
  );
});

test("explore shows strangers' posts, liveliest first; search matches every word", async () => {
  const { social } = await setup();
  const make = (userId: string, title: string, caption = "") => {
    const built = buildPost({ ...startPostDesign("note"), headline: title, photos: [] });
    const d = social.createDraft(as(userId), {
      ...built,
      metadata: { ...built.metadata, caption, contributors: [] },
    });
    return social.publish(as(userId), d.id, 1);
  };
  const quiet = make("budi", "Quiet morning");
  const busy = make("budi", "Night market", "street food #jakarta");
  const friend = make("citra", "Friend's post");
  make("ana", "My own");
  social.toggle(as("citra"), busy.id, "like");
  social.comment(as("citra"), busy.id, "yum");
  social.follow(as("ana"), "citra");
  assert.deepEqual(
    social.explore(as("ana")).map((p) => p.id),
    [busy.id, quiet.id],
  );
  assert.deepEqual(
    social.explore(as("ana"), "#JAKARTA food").map((p) => p.id),
    [busy.id],
  );
  assert.deepEqual(
    social.explore(as("ana"), "friend").map((p) => p.id),
    [friend.id],
  );
  assert.equal(social.explore(as("ana"), "my own").length, 1);
  assert.equal(social.explore(as("ana"), "nothing like this").length, 0);
  assert.throws(() => social.explore(as("ana"), "x".repeat(61)));
});
