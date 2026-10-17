import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { ThemeStudio } from "../packages/core/src/themes.js";
import { themeSubmissionSchema } from "../packages/contracts/src/themes.js";
import { renderMoment } from "../apps/server/moments.js";

const admin = { userId: "mod" },
  maya = { userId: "maya" },
  leo = { userId: "leo" };

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-themes-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["mod", "maya", "leo"]) store.put("user", id, { id, name: id, handle: id });
  });
  const social = new SocialService(store);
  const now = () => new Date("2026-03-10T10:00:00Z");
  const identity = new IdentityService(social, renderMoment, now);
  const studio = new ThemeStudio(social, (id) => id === "mod", now);
  identity.communityThemes = () => studio.approved();
  return { identity, studio };
}
const piece = (patch: Record<string, unknown> = {}) => ({
  anchor: "top-right",
  width: 120,
  height: 60,
  dx: -130,
  dy: -30,
  html: '<div class="b">hi</div>',
  css: ".b{color:red;background:url(data:image/png;base64,AAAA)}",
  ...patch,
});
const theme = (patch: Record<string, unknown> = {}) => ({
  name: "Hello tag",
  accent: "#ff5a36",
  font: "display",
  kind: "market",
  pieces: [piece()],
  ...patch,
});
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);
const invalid = (input: unknown) =>
  assert.equal(themeSubmissionSchema.safeParse(input).success, false);

test("a submission names no creator and carries no code that could only pretend to work", () => {
  assert.ok(themeSubmissionSchema.safeParse(theme()).success);
  // The creator always comes from the session.
  invalid({ ...theme(), creatorId: "leo" });
  invalid(theme({ pieces: [piece({ html: "<script>alert(1)</script>" })] }));
  invalid(theme({ pieces: [piece({ html: '<div onclick="x()">hi</div>' })] }));
  invalid(theme({ pieces: [piece({ html: '<img src="https://tracker.example/p.gif">' })] }));
  invalid(theme({ pieces: [piece({ css: ".b{background:url(https://x.example/a.png)}" })] }));
  invalid(theme({ pieces: [piece({ css: "@import 'https://x.example/a.css';" })] }));
  invalid(theme({ pieces: [piece({ html: '<a href="javascript:alert(1)">x</a>' })] }));
  // A piece that reaches deep into the post would cover it while people scroll.
  invalid(theme({ pieces: [piece({ dy: 40, height: 200 })] }));
  invalid(theme({ pieces: Array.from({ length: 7 }, () => piece()) }));
  // Event and members themes name an event or organisation from the host's lists, and only they do.
  invalid(theme({ kind: "event" }));
  invalid(theme({ kind: "market", eventId: "trip-france" }));
  invalid(theme({ kind: "event", eventId: "made-up-event" }));
  assert.ok(
    themeSubmissionSchema.safeParse(theme({ kind: "event", eventId: "trip-france" })).success,
  );
});

test("only approved themes reach the market, and taking one down takes it off its wearers", async () => {
  const { identity, studio } = await setup();
  const sent = studio.submit(maya, theme());
  assert.equal(sent.status, "pending");
  assert.equal(sent.creator.id, "maya");
  const inMarket = () => identity.decorations(leo).items.some((d) => d.id === sent.id);
  assert.equal(inMarket(), false);
  rejects(
    () => identity.chooseDecoration(leo, { decorationId: sent.id, scope: "base" }),
    "DECORATION_LOCKED",
  );
  // Waiting work is the designer's and the moderators' business only.
  assert.equal(studio.mine(leo).length, 0);
  rejects(() => studio.queue(maya), "NOT_FOUND");
  rejects(() => studio.review(maya, sent.id, { decision: "approve" }), "NOT_FOUND");
  assert.deepEqual(
    studio.queue(admin).map((t) => t.id),
    [sent.id],
  );

  studio.review(admin, sent.id, { decision: "approve" });
  assert.equal(inMarket(), true);
  rejects(() => studio.withdraw(maya, sent.id), "THEME_IN_MARKET");
  identity.chooseDecoration(leo, { decorationId: sent.id, scope: "base" });
  const worn = identity.themeFor(leo, "leo")!;
  assert.equal(worn.name, "Hello tag");
  assert.equal(worn.creator, "maya");
  // The designer's code travels as html and css, never as svg the page would insert as markup.
  assert.ok(worn.pieces.every((p) => "html" in p && !("svg" in p)));

  studio.review(admin, sent.id, { decision: "remove", note: "Copied from another designer" });
  assert.equal(identity.themeFor(leo, "leo"), null);
  assert.equal(inMarket(), false);
  assert.equal(studio.mine(maya)[0]!.note, "Copied from another designer");
});

test("a decision is final, rejected work can be deleted, and the queue has a limit", async () => {
  const { studio } = await setup();
  const first = studio.submit(maya, theme());
  studio.review(admin, first.id, { decision: "reject", note: "Too dark on light mode" });
  rejects(() => studio.review(admin, first.id, { decision: "approve" }), "THEME_ALREADY_REVIEWED");
  rejects(() => studio.withdraw(leo, first.id), "NOT_FOUND");
  assert.equal(studio.withdraw(maya, first.id).length, 0);
  for (let i = 0; i < 5; i++) studio.submit(maya, theme({ name: `Tag ${i}` }));
  rejects(() => studio.submit(maya, theme()), "THEME_QUEUE_FULL");
  studio.erase("maya");
  assert.equal(studio.mine(maya).length, 0);
});

test("a community event theme opens only with its event's proof, like catalog ones", async () => {
  const { identity, studio } = await setup();
  const trip = studio.submit(maya, theme({ kind: "event", eventId: "trip-france" }));
  studio.review(admin, trip.id, { decision: "approve" });
  const item = identity.decorations(leo).items.find((d) => d.id === trip.id)!;
  assert.equal(item.event, "Trip to France");
  assert.equal(item.unlocked, false);
  rejects(
    () => identity.chooseDecoration(leo, { decorationId: trip.id, scope: "base" }),
    "DECORATION_LOCKED",
  );
});

test("a wearer makes a theme their own without changing it for anyone else", async () => {
  const { identity, studio } = await setup();
  const sent = studio.submit(
    maya,
    theme({ pieces: [piece({ html: '<div class="b" data-text="sign">hi</div>' })] }),
  );
  studio.review(admin, sent.id, { decision: "approve" });
  for (const who of [leo, admin])
    identity.chooseDecoration(who, { decorationId: sent.id, scope: "base" });
  const edit = {
    decorationId: sent.id,
    pieces: [{ dx: -200, dy: -40 }],
    texts: { "0.sign": "Leo's" },
  };
  identity.editDecoration(leo, edit);
  const mine = identity.themeFor(maya, "leo")!.pieces[0]!;
  assert.equal(mine.dx, -200);
  assert.deepEqual("texts" in mine && mine.texts, { sign: "Leo's" });
  // Another wearer of the same theme, and the market, still see the designer's original.
  const other = identity.themeFor(maya, "mod")!.pieces[0]!;
  assert.equal(other.dx, -130);
  assert.ok(!("texts" in other));
  assert.equal(identity.decorations(admin).items.find((d) => d.id === sent.id)!.edit, null);

  // Pieces stay near an edge, and only the designer's marked text can change.
  const invalid = (patch: Record<string, unknown>) =>
    rejects(() => identity.editDecoration(leo, { ...edit, ...patch }), "THEME_EDIT_INVALID");
  invalid({ pieces: [{ dx: -200, dy: 120 }] });
  invalid({ pieces: [] });
  invalid({ texts: { "0.title": "nope" } });
  assert.throws(() =>
    identity.editDecoration(leo, { ...edit, texts: { "0.sign": "x".repeat(41) } }),
  );
  assert.throws(() => identity.editDecoration(leo, { ...edit, userId: "maya" }));

  identity.resetDecorationEdit(leo, sent.id);
  assert.equal(identity.themeFor(maya, "leo")!.pieces[0]!.dx, -130);
});

test("a theme cannot be edited before it can be worn", async () => {
  const { identity, studio } = await setup();
  const trip = studio.submit(maya, theme({ kind: "event", eventId: "trip-france" }));
  studio.review(admin, trip.id, { decision: "approve" });
  rejects(
    () =>
      identity.editDecoration(leo, {
        decorationId: trip.id,
        pieces: [{ dx: -130, dy: -30 }],
        texts: {},
      }),
    "DECORATION_LOCKED",
  );
});
