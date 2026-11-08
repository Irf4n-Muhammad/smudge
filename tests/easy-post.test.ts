import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPost,
  fillableParts,
  firstReact,
  postStyles,
  readPostDesign,
  restylePost,
  startPostDesign,
} from "../packages/core/src/easy-post.js";
import { experienceSchema, metadataSchema } from "../packages/contracts/src/experience.js";
import { fillPackage, normalizeFill, readFill } from "../packages/core/src/fill.js";

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

test("ticking parts makes an easy post a fill-in format, and a version reopens with its own words", () => {
  const base = { ...startPostDesign("poster"), photos: [photo(1), photo(2)], quote: "" };
  assert.deepEqual(fillableParts(base), ["kicker", "headline", "text", "photo"], "no quote shown");
  const plain = buildPost(base).package;
  assert.equal(plain.files["smudge/fill.js"], undefined, "nothing offered, no form");
  assert.equal(readFill(plain), null);

  const design = { ...base, fill: ["headline" as const, "photo" as const, "quote" as const] };
  const pkg = normalizeFill(buildPost(design).package);
  assert.deepEqual(
    readFill(pkg)?.map((f) => [f.key, f.kind, f.value]),
    [
      ["headline", "text", design.headline],
      ["photo", "image", `asset:${photo(1).assetId}`],
    ],
    "a part the post doesn't show is left out",
  );
  const html = pkg.files["index.html"]!;
  assert.match(html, /<h1[^>]*data-fill="headline" data-fill-rich>/);
  assert.match(html, new RegExp(`<img src="asset:${photo(1).assetId}" data-fill="photo"`));
  assert.ok(
    html.indexOf("smudge/fill.js") < html.indexOf("motion.js"),
    "words are in before the headline is spelled in",
  );
  assert.deepEqual(readPostDesign(pkg), design);

  // Someone's version: the editor opens it with their words and photo, not the maker's.
  const theirs = fillPackage(pkg, {
    headline: "My *own* line",
    photo: photo(3).assetId,
  });
  const reopened = readPostDesign(theirs)!;
  assert.equal(reopened.headline, "My *own* line");
  assert.equal(reopened.photos[0]!.assetId, photo(3).assetId);
  assert.equal(reopened.text, design.text);

  // A video cover can't be swapped from a form.
  const video = { ...base, photos: [{ ...photo(1), videoAssetId: photo(4).assetId }] };
  assert.ok(!fillableParts(video).includes("photo"));
});

test("an Ask is a photo and one question that takes one answer, by tap, words or slider", () => {
  const ask = startPostDesign("ask", { photos: [photo(1)] });
  assert.deepEqual(ask.ask, { kind: "poll", options: ["Yes, do it", "Don't"] });
  const built = buildPost(ask);
  assert.deepEqual(built.package.manifest.capabilities, ["answers.write", "answers.read"]);
  assert.ok(experienceSchema.safeParse(built.package).success);
  const html = built.package.files["index.html"]!;
  assert.match(html, /data-ask-option="0"[^>]*>.*Yes, do it/);
  assert.match(html, /<script src="ask.js"><\/script>/);
  assert.deepEqual(readPostDesign(built.package), ask);

  assert.throws(() => buildPost({ ...ask, ask: { kind: "poll", options: ["Only one"] } }));
  const open = buildPost({ ...ask, ask: { kind: "open", options: [] } }).package;
  assert.match(open.files["index.html"]!, /data-ask-form/);
  const slide = buildPost({ ...ask, ask: { kind: "slider", options: [], emoji: "🔥" } }).package;
  assert.match(slide.files["index.html"]!, /data-ask-range.*|🔥/);
  assert.match(
    buildPost({ ...ask, photos: [], headline: "<b>hi</b>" }).package.files["index.html"]!,
    /&lt;b&gt;hi/,
  );

  // Switching to Ask from another style gives it a question to answer.
  const fromPoster = restylePost(startPostDesign("poster"), "ask");
  assert.equal(fromPoster.ask?.kind, "poll");
});

test("any post can carry one tap, pinned to the bottom so it shows in a feed card", () => {
  const plain = buildPost(startPostDesign("poster")).package;
  assert.deepEqual(plain.manifest.capabilities, [], "no tap, no answers");
  for (const style of postStyles.filter((s) => s !== "ask" && s !== "plan")) {
    const design = { ...startPostDesign(style), ask: firstReact() };
    const pkg = buildPost(design).package;
    assert.deepEqual(pkg.manifest.capabilities, ["answers.write", "answers.read"], style);
    assert.match(
      pkg.files["index.html"]!,
      /<section class="answer tap"[^>]*>.*aria-label="🔥"/,
      style,
    );
    assert.match(
      pkg.files["post.css"]!,
      /\.answer\.tap\{position:fixed;left:0;right:0;bottom:0/,
      style,
    );
    assert.deepEqual(readPostDesign(pkg), design);
  }
  // A plan already has its tap ("I'm in"): no second one.
  const plan = buildPost({ ...startPostDesign("plan"), ask: firstReact() }).package;
  assert.deepEqual(plan.manifest.capabilities, ["plan.read", "plan.join"]);
  assert.throws(() =>
    buildPost({ ...startPostDesign("note"), ask: { kind: "react", options: ["🔥"] } }),
  );
});
