import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPost,
  postStyles,
  readPostDesign,
  restylePost,
  startPostDesign,
} from "../packages/core/src/easy-post.js";
import { experienceSchema, metadataSchema } from "../packages/contracts/src/experience.js";

const photo = (n: number) => ({
  assetId: `00000000-0000-4000-8000-00000000000${n}`,
  caption: n === 1 ? 'Rooftop <img src=x onerror="alert(1)">' : "",
});

test("every style builds a valid post that reopens with the same settings", () => {
  for (const style of postStyles) {
    const design = { ...startPostDesign(style), photos: [photo(1), photo(2), photo(3)] };
    const built = buildPost(design);
    const pkg = experienceSchema.parse(built.package);
    assert.deepEqual(readPostDesign(pkg), design, style);
    assert.equal(built.metadata.coverAssetId, photo(1).assetId);
    metadataSchema.parse({ ...built.metadata, caption: "", contributors: [] });
    assert.ok(pkg.manifest.schemaVersion === 2 && pkg.manifest.assets.length === 3);
    for (const id of ["headline", "photo-0"])
      assert.ok(pkg.files["index.html"]!.includes(`data-edit="${id}"`), `${style} ${id}`);
  }
});

test("words are escaped, stars make italics, and only the fixed scripts run", () => {
  const design = {
    ...startPostDesign("magazine"),
    headline: "Hello *world* </script><script>alert(1)</script>",
    text: "First <b>para</b>\n\nSecond",
    photos: [photo(1)],
  };
  const { package: pkg } = buildPost(design);
  const html = pkg.files["index.html"]!;
  assert.ok(html.includes("Hello <em>world</em> &lt;/script&gt;"));
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("<p>First &lt;b&gt;para&lt;/b&gt;</p><p>Second</p>"));
  assert.deepEqual(html.match(/<script[^>]*>/g), [
    '<script src="smudge/post.js">',
    '<script src="motion.js">',
  ]);
  assert.ok(!pkg.files["smudge/post.js"]!.includes("</script"));
  assert.equal(buildPost({ ...design, motion: false }).package.files["motion.js"], undefined);
});

test("changing style keeps words and photos; bad input is refused", () => {
  const start = { ...startPostDesign("poster"), headline: "Mine", photos: [photo(1)] };
  const next = restylePost(start, "scrapbook");
  assert.equal(next.headline, "Mine");
  assert.deepEqual(next.photos, start.photos);
  assert.equal(next.font, "hand");
  assert.equal(buildPost(next).metadata.format, "scrapbook");
  assert.throws(() => buildPost({ ...start, headline: "" }));
  assert.throws(() => buildPost({ ...start, palette: "neon" }));
  assert.throws(() => buildPost({ ...start, photos: Array.from({ length: 13 }, () => photo(1)) }));
  assert.equal(
    readPostDesign({ ...buildPost(start).package, files: { "index.html": "<p>hi</p>" } }),
    null,
  );
});
