import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { fillFile, fillPackage, readFill } from "../packages/core/src/fill.js";
import { renderDocument } from "../packages/runtime/src/document.js";

const photo = "20000000-0000-4000-8000-000000000001";
const mine = "20000000-0000-4000-8000-000000000002";
const fields = [
  { key: "title", label: "Title", kind: "text", value: "Guess the song" },
  { key: "photo", label: "Photo", kind: "image", value: `asset:${photo}` },
];
const format = (list: unknown = { fields }) => ({
  package: {
    manifest: {
      schemaVersion: 2 as const,
      runtimeVersion: "web-v1" as const,
      name: "Quiz",
      entrypoint: "index.html",
      capabilities: [],
      assets: [photo],
    },
    files: {
      "index.html": '<script src="smudge/fill.js"></script><h1 data-fill="title"></h1>',
      [fillFile]: `window.smudgeFill = ${JSON.stringify(list)};\n`,
    },
  },
  metadata: { title: "Quiz", format: "custom" as const, caption: "", contributors: [] },
});
async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-fill-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["ana", "budi"])
      store.put("user", id, { id, name: id, handle: id, initials: "X", color: "#fff", bio: "" });
    store.put("asset", photo, {
      id: photo,
      ownerId: "shared",
      mime: "image/png",
      base64: "",
      name: "p",
    });
    store.put("asset", mine, {
      id: mine,
      ownerId: "budi",
      mime: "image/png",
      base64: "",
      name: "m",
    });
  });
  return new SocialService(store);
}
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);

test("a format's fields are checked on save and get the standard fill script", async () => {
  const social = await setup();
  const draft = social.createDraft({ userId: "ana" }, format());
  assert.deepEqual(readFill(draft.package), fields);
  assert.match(draft.package.files[fillFile]!, /querySelectorAll\("\[data-fill\]"\)/);
  rejects(() => social.createDraft({ userId: "ana" }, format({ fields: [] })), "INVALID_FILL");
  rejects(
    () =>
      social.createDraft(
        { userId: "ana" },
        format({ fields: [{ ...fields[1], value: `asset:${mine}` }] }),
      ),
    "FILL_ASSET_NOT_IN_MANIFEST",
  );
  // Script-breaking text stays inside the JSON string once the runtime inlines the file.
  const sneaky = social.createDraft(
    { userId: "ana" },
    format({ fields: [{ ...fields[0], value: "</script><script>alert(1)</script>" }] }),
  );
  const html = renderDocument(sneaky.package, "n", {});
  assert.equal(html.match(/<script>/g)!.length, 2);
});

test("filling a format changes only the listed values and adds a new photo to the manifest", async () => {
  const social = await setup();
  const draft = social.createDraft({ userId: "ana" }, format());
  const filled = fillPackage(draft.package, { title: "Tebak lagu", photo: mine });
  assert.deepEqual(
    readFill(filled)!.map((f) => f.value),
    ["Tebak lagu", `asset:${mine}`],
  );
  assert.deepEqual(filled.manifest.schemaVersion === 2 && filled.manifest.assets, [photo, mine]);
  assert.equal(filled.files["index.html"], draft.package.files["index.html"]);
  rejects(() => fillPackage(draft.package, { nope: "x" }), "UNKNOWN_FILL_KEY");
  assert.throws(() => fillPackage(draft.package, { title: "x".repeat(201) }));
  const plain = { ...draft.package, files: { "index.html": "<p>hi</p>" } };
  rejects(() => fillPackage(plain, { title: "x" }), "NOT_FILLABLE");
});
