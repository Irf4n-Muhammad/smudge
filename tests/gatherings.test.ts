import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { GUEST, SocialService } from "../packages/core/src/social.js";
import { GatheringsService, normalizePhone } from "../packages/core/src/gatherings.js";

const dina = { userId: "dina" },
  bob = { userId: "bob" },
  guest = { userId: GUEST };

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-gather-")), "db.sqlite"));
  store.transaction(() => {
    for (const id of ["dina", "bob"])
      store.put("user", id, {
        id,
        name: id[0]!.toUpperCase() + id.slice(1),
        handle: id,
        initials: id[0]!.toUpperCase(),
        color: "#eee",
      });
  });
  const social = new SocialService(store);
  const gatherings = new GatheringsService(social);
  const invite = gatherings.create(dina, {
    kind: "wedding",
    title: "Dina & Raka",
    date: "2026-12-12",
    place: "Gedung Sate, Bandung",
    rundown: [
      { time: "09:00", title: "Akad" },
      { time: "11:00", title: "Resepsi" },
    ],
    vendors: [{ role: "Photographer", name: "Lensa Kita" }],
  });
  return { store, gatherings, invite };
}
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);
const answer = { name: "Tante Sri", phone: "0812-3456-7890", attending: true, guests: 2 };

test("phone numbers are read the way people write them", () => {
  assert.equal(normalizePhone("0812-3456-7890"), "6281234567890");
  assert.equal(normalizePhone("+62 812 3456 7890"), "6281234567890");
  assert.equal(normalizePhone("0062 812 3456 7890"), "6281234567890");
  assert.equal(normalizePhone("+44 20 7946 0958"), "442079460958");
  for (const bad of ["12345", "+1234567890123456"])
    rejects(() => normalizePhone(bad), "INVALID_PHONE");
});

test("anyone with the link reads the invite, but it never shows who answered", async () => {
  const { gatherings, invite } = await setup();
  gatherings.respond(guest, invite.id, answer);
  const view = gatherings.invite(invite.id);
  assert.equal(view.title, "Dina & Raka");
  assert.equal(view.hostName, "Dina");
  assert.deepEqual(
    view.rundown.map((r) => r.title),
    ["Akad", "Resepsi"],
  );
  assert.equal("ownerId" in view, false);
  assert.equal(JSON.stringify(view).includes("Tante Sri"), false);
  rejects(() => gatherings.invite("00000000-0000-4000-8000-000000000000"), "NOT_FOUND");
});

test("a guest answers without an account, and the same number answering again replaces it", async () => {
  const { gatherings, invite } = await setup();
  gatherings.respond(guest, invite.id, answer);
  gatherings.respond(guest, invite.id, {
    ...answer,
    phone: "+62 812 3456 7890",
    guests: 4,
    message: "Selamat!",
  });
  gatherings.respond(guest, invite.id, {
    name: "Om Budi",
    phone: "0813 1111 2222",
    attending: false,
  });
  const list = gatherings.guests(dina, invite.id);
  assert.equal(list.rsvps.length, 2);
  assert.deepEqual(list.totals, { attending: 1, declined: 1, guests: 4 });
  const sri = list.rsvps.find((r) => r.name === "Tante Sri")!;
  assert.equal(sri.message, "Selamat!");
  assert.equal(sri.phoneEnd, "890");
  // Someone who declines adds nobody to the head count, whatever number they typed.
  assert.equal(list.rsvps.find((r) => r.name === "Om Budi")!.guests, 0);
});

test("only the host sees the answers, and the number itself is never stored", async () => {
  const { store, gatherings, invite } = await setup();
  gatherings.respond(guest, invite.id, answer);
  rejects(() => gatherings.guests(bob, invite.id), "NOT_HOST");
  rejects(() => gatherings.guests(guest, invite.id), "UNAUTHENTICATED");
  const stored = JSON.stringify(store.all("gathering-rsvp"));
  assert.equal(stored.includes("81234567890"), false);
  assert.equal(stored.includes("0812"), false);
});

test("a signed-in guest finds the gathering in their own list", async () => {
  const { gatherings, invite } = await setup();
  assert.deepEqual(gatherings.mine(bob), []);
  gatherings.respond(bob, invite.id, { ...answer, name: "Bob" });
  assert.deepEqual(
    gatherings.mine(bob).map((g) => [g.title, g.host]),
    [["Dina & Raka", false]],
  );
  assert.equal(gatherings.mine(dina)[0]!.host, true);
  assert.equal(gatherings.guests(dina, invite.id).rsvps[0]!.member, true);
});

test("invites are validated, and hosts and deleted accounts take their gatherings with them", async () => {
  const { store, gatherings, invite } = await setup();
  rejects(() => gatherings.create(guest, { kind: "wedding" }), "UNAUTHENTICATED");
  assert.throws(() =>
    gatherings.create(dina, { kind: "wedding", title: "X", date: "12/12/2026", place: "Here" }),
  );
  assert.throws(() =>
    gatherings.create(dina, {
      kind: "wedding",
      title: "X",
      date: "2026-12-12",
      place: "Here",
      ownerId: "bob",
    }),
  );
  assert.throws(() => gatherings.respond(guest, invite.id, { ...answer, guests: 11 }));
  gatherings.respond(bob, invite.id, { ...answer, name: "Bob" });
  rejects(() => gatherings.remove(bob, invite.id), "NOT_HOST");
  // Bob's account goes: his answer stays with Dina, no longer linked to him.
  store.transaction(() => gatherings.erase("bob"));
  assert.equal(gatherings.guests(dina, invite.id).rsvps[0]!.member, false);
  // Dina's account goes: the gathering and its answers go with it.
  store.transaction(() => gatherings.erase("dina"));
  rejects(() => gatherings.invite(invite.id), "NOT_FOUND");
  assert.equal(store.all("gathering-rsvp").length, 0);
});
