import { randomUUID } from "node:crypto";
import type { SocialService } from "../../packages/core/src/social.js";
import type { Chapter } from "../../packages/contracts/src/identity.js";
import type { SidesService } from "../../packages/core/src/sides.js";
import type { Experience, Metadata } from "../../packages/contracts/src/experience.js";
import { buildPost, startPostDesign } from "../../packages/core/src/easy-post.js";

const sans = `system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
const condensed = `Impact,"Arial Narrow Bold","Helvetica Neue",sans-serif`;
const page = (name: string, html: string): Experience => ({
  manifest: {
    schemaVersion: 2,
    runtimeVersion: "web-v1",
    name,
    entrypoint: "index.html",
    capabilities: [],
    assets: [],
  },
  files: { "index.html": html },
});

const longRun = page(
  "Sunday long run · 21K",
  `<style>*{box-sizing:border-box;margin:0}body{background:#fff4e8;color:#2a1a0c;font-family:${sans}}main{min-height:560px;padding:26px 22px}.kick{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#e07a1f}h1{font:400 64px/.9 ${condensed};text-transform:uppercase;margin-top:8px}.big{display:flex;gap:18px;margin-top:18px}.big div{flex:1;background:#fff;border-radius:16px;padding:14px;border:2px solid #e07a1f}.big b{display:block;font:400 34px ${condensed};color:#e07a1f}.big small{font-size:12px;opacity:.7}table{width:100%;margin-top:18px;border-collapse:collapse;font-size:14px}td{padding:8px 4px;border-bottom:1px dashed #e0b48a}td:last-child{text-align:right;font-family:ui-monospace,Menlo,monospace}p{margin-top:18px;font-size:15px;line-height:1.5}</style><main><div class="kick">● SUNDAY · 05:40 · GBK LOOP</div><h1>Twenty-one<br>kilometres</h1><div class="big"><div><b>21.1</b><small>km</small></div><div><b>6:12</b><small>min/km</small></div><div><b>2:11</b><small>hours</small></div></div><table><tr><td>5 km</td><td>6:30</td></tr><tr><td>10 km</td><td>6:18</td></tr><tr><td>15 km</td><td>6:05</td></tr><tr><td>21 km</td><td>5:58</td></tr></table><p>Negative split for the first time. Legs are gone, mood is great. Thursday track, anyone?</p></main>`,
);
const raceDay = page(
  "Race day · Borobudur Marathon",
  `<style>*{box-sizing:border-box;margin:0}body{background:#1b1b1f;color:#fff;font-family:${sans}}main{min-height:560px;padding:26px 22px;display:flex;flex-direction:column}.bib{background:#fff;color:#1b1b1f;border-radius:18px;padding:22px;margin-top:10px;position:relative}.bib:before,.bib:after{content:"";position:absolute;top:12px;width:12px;height:12px;border-radius:50%;background:#1b1b1f}.bib:before{left:14px}.bib:after{right:14px}.bib small{display:block;text-align:center;font:700 12px ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#e07a1f}.bib b{display:block;text-align:center;font:400 120px/1 ${condensed};margin:6px 0}.bib span{display:block;text-align:center;font-size:14px;opacity:.75}h1{font:400 44px/.95 ${condensed};text-transform:uppercase;margin-top:22px;color:#e07a1f}p{margin-top:12px;font-size:15px;line-height:1.5;opacity:.9}</style><main><div class="bib"><small>BOROBUDUR MARATHON 2026</small><b>4217</b><span>Leo Pratama · Full · Wave C</span></div><h1>Tomorrow, 4 a.m.</h1><p>Carb-loaded, bib pinned, alarm set three times. If you see 4217 crawling past kilometre 35, shout something.</p></main>`,
);
const jury = page(
  "Jury notes · day 1",
  `<style>*{box-sizing:border-box;margin:0}body{background:#0f1733;color:#eef1ff;font-family:${sans}}main{min-height:560px;padding:26px 22px}small{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#8fb0ff}h1{font:400 52px/.95 ${condensed};text-transform:uppercase;margin-top:8px}ol{margin:20px 0 0 20px;font-size:15px;line-height:1.7}p{margin-top:18px;font-size:14px;opacity:.8}</style><main><small>CREW AND JURY ONLY</small><h1>Day one,<br>eleven shorts</h1><ol><li>Hujan di Bulan Juni: strong, long.</li><li>Kios: the sound mix needs a second look before Friday.</li><li>Lampu Merah: crowd favourite, jury split.</li></ol><p>Nothing here leaves this side until the awards.</p></main>`,
);

const clutch = page(
  "Clutch · 1v3 on Ascent",
  `<style>*{box-sizing:border-box;margin:0}body{background:#120b2a;color:#f3efff;font-family:${sans}}main{min-height:560px;padding:26px 22px;display:flex;flex-direction:column}.kick{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#b79cff}h1{font:400 66px/.9 ${condensed};text-transform:uppercase;margin-top:8px}h1 em{font-style:normal;color:#d8ff3d}.score{display:flex;align-items:center;gap:14px;margin-top:22px;font:400 46px ${condensed}}.score small{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;opacity:.7}.feed{margin-top:22px;display:grid;gap:8px}.feed div{display:flex;justify-content:space-between;padding:10px 12px;border-radius:10px;background:#1c1140;font-size:14px}.feed b{color:#d8ff3d}.feed span{font-family:ui-monospace,Menlo,monospace;opacity:.7}p{margin-top:auto;padding-top:18px;font-size:15px;line-height:1.5;opacity:.9}</style><main><div class="kick">▶ REPLAY · ROUND 23 · ASCENT</div><h1>One left,<br><em>three to go</em></h1><div class="score">11 <small>US</small> – <small>THEM</small> 11</div><div class="feed"><div><b>dani</b> ⟶ Vandal · headshot <span>0:14</span></div><div><b>dani</b> ⟶ Vandal · wallbang <span>0:09</span></div><div><b>dani</b> ⟶ Classic · defuse at 0.3s <span>0:01</span></div></div><p>Hands were shaking. Raka screaming on comms counts as a fourth kill.</p></main>`,
);
const cup = page(
  "Weekend cup · bracket",
  `<style>*{box-sizing:border-box;margin:0}body{background:#f3f0ff;color:#1b1230;font-family:${sans}}main{min-height:560px;padding:26px 22px}.kick{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#6b3df5}h1{font:400 58px/.9 ${condensed};text-transform:uppercase;margin-top:8px}.bracket{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:22px;align-items:center}.m{display:grid;gap:6px}.t{background:#fff;border:2px solid #d9d0ff;border-radius:10px;padding:9px 12px;font-size:14px;font-weight:700;display:flex;justify-content:space-between}.t.w{border-color:#6b3df5}.t small{font-family:ui-monospace,Menlo,monospace;font-weight:400;opacity:.6}.final .t{border-style:dashed}.lab{font:700 10px ui-monospace,Menlo,monospace;letter-spacing:.14em;opacity:.6;margin-bottom:4px}p{margin-top:20px;font-size:15px;line-height:1.5}</style><main><div class="kick">SATURDAY 14:00 · ARIF'S PLACE · BO3</div><h1>Weekend<br>cup</h1><div class="bracket"><div><div class="lab">SEMIS</div><div class="m"><div class="t w">Night Owls <small>2</small></div><div class="t">Kopi Squad <small>1</small></div></div><div class="m" style="margin-top:12px"><div class="t">Raka's Five <small>–</small></div><div class="t">Bandung LAN <small>–</small></div></div></div><div><div class="lab">FINAL</div><div class="m final"><div class="t">Night Owls</div><div class="t">?</div></div></div><div><div class="lab">PRIZE</div><div class="t w">Free coffee for a month ☕</div></div></div><p>Second semi plays Saturday. Bring your own mouse, we have the rest.</p></main>`,
);

/**
 * Demo side (ADR 0033): Gamers, the second community to test the side's home against. Four
 * people, a "squad up" plan with one who was there, a clip and a tournament bracket. Alex is
 * not in it, so the demo also shows joining an open side. Runs once.
 */
export function seedGamers(service: SocialService, sides: SidesService) {
  const store = service.store;
  if (store.get("system", "seed-gamers-v1")) return;
  const people = ["raka", "dani", "arif", "ines"].filter((id) => store.get("user", id));
  store.transaction(() => {
    for (const userId of people) sides.grant(userId, "gamers");
  });
  const publish = (owner: string, pkg: Experience, metadata: Metadata) => {
    if (!store.get("user", owner)) return null;
    const actor = { userId: owner };
    const draft = service.createDraft(actor, { package: pkg, metadata });
    return service.publish(actor, draft.id, draft.revision);
  };
  publish("arif", cup, {
    title: "Weekend cup · bracket",
    caption: "Semis Saturday at the coffee bar. Bring a mouse.",
    format: "custom",
    contributors: [],
    side: "gamers",
  });
  publish("dani", clutch, {
    title: "Clutch · 1v3 on Ascent",
    caption: "Round 23. Hands still shaking.",
    format: "custom",
    contributors: [],
    side: "gamers",
  });
  const squad = buildPost(
    startPostDesign("plan", {
      kicker: "Tonight 21:00 · Valorant ranked",
      headline: "Squad up, *who's on?*",
      text: "Five-stack or we don't queue. Comms on the usual Discord, mic on, nobody leaves before map three.",
      palette: "night",
      motion: true,
    }),
  );
  const plan = publish("raka", squad.package, {
    ...squad.metadata,
    caption: "21:00, five-stack. Mic on.",
    contributors: [],
    side: "gamers",
  });
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  store.transaction(() => {
    if (plan) {
      if (store.get("user", "dani"))
        store.put("rsvp", `${plan.id}:dani`, {
          postId: plan.id,
          userId: "dani",
          at: daysAgo(1),
          came: daysAgo(0.6),
        });
      if (store.get("user", "arif"))
        store.put("rsvp", `${plan.id}:arif`, { postId: plan.id, userId: "arif", at: daysAgo(0.8) });
    }
    store.put("system", "seed-gamers-v1", { complete: true });
  });
}

/** Demo sides: Runners for most of the demo accounts, and the private Film Festival crew. Runs once. */
export function seedSides(service: SocialService, sides: SidesService) {
  const store = service.store;
  if (store.get("system", "seed-sides-v1")) return;
  store.transaction(() => {
    for (const userId of ["you", "maya", "leo", "ines"])
      if (store.get("user", userId)) sides.grant(userId, "runners");
    // Leo's festival chapter is seeded as a record, so it never passed through the chapter hook.
    if (store.get("user", "leo")) sides.grant("leo", "film-fest");
  });
  const posts: { owner: string; pkg: Experience; metadata: Metadata }[] = [
    {
      owner: "maya",
      pkg: longRun,
      metadata: {
        title: "Sunday long run · 21K",
        caption: "Negative split, finally. Thursday track, anyone?",
        format: "custom",
        contributors: [],
        side: "runners",
      },
    },
    {
      owner: "leo",
      pkg: raceDay,
      metadata: {
        title: "Race day · Borobudur Marathon",
        caption: "Bib 4217. Shout if you see me past kilometre 35.",
        format: "custom",
        contributors: [],
        side: "runners",
      },
    },
    {
      owner: "leo",
      pkg: jury,
      metadata: {
        title: "Jury notes · day 1",
        caption: "Eleven shorts, one long day. Crew and jury only.",
        format: "custom",
        contributors: [],
        side: "film-fest",
      },
    },
  ];
  for (const p of posts) {
    const actor = { userId: p.owner };
    if (!store.get("user", p.owner)) continue;
    const draft = service.createDraft(actor, { package: p.pkg, metadata: p.metadata });
    service.publish(actor, draft.id, draft.revision);
  }
  store.transaction(() => store.put("system", "seed-sides-v1", { complete: true }));
}

/**
 * A demo plan (ADR 0029): Ines's track night is a post people join, with two already in, so the
 * first tap on "I'm in" shows a name joining a list rather than starting one. Runs once.
 */
export function seedPlan(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-plan-v1") || !store.get("user", "ines")) return;
  const built = buildPost(
    startPostDesign("plan", {
      kicker: "Thursday 19:30 · Senayan track",
      headline: "Track night, *who's in?*",
      text: "8 × 400 m on lane 1, or an easy 5K on the outer lanes. Bring water, bring someone slower than you so you feel fast.",
      motion: true,
    }),
  );
  const actor = { userId: "ines" };
  const draft = service.createDraft(actor, {
    package: built.package,
    metadata: {
      ...built.metadata,
      caption: "Senayan, 19:30. Intervals or an easy 5K, your pick.",
      contributors: [],
      side: "runners",
    },
  });
  const post = service.publish(actor, draft.id, draft.revision);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  store.transaction(() => {
    for (const [userId, days] of [
      ["maya", 2],
      ["leo", 1],
    ] as const)
      if (store.get("user", userId))
        store.put("rsvp", `${post.id}:${userId}`, { postId: post.id, userId, at: daysAgo(days) });
    store.put("system", "seed-plan-v1", { complete: true });
  });
}

/** A demo gift (ADR 0031): Maya gave Alex a market theme with a note. Runs once. */
export function seedGift(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-gift-v1")) return;
  store.transaction(() => {
    if (store.get("user", "maya") && store.get("user", "you"))
      store.put("gift", "gift-seed-maya-you", {
        id: "gift-seed-maya-you",
        fromId: "maya",
        toId: "you",
        decorationId: "cat-peek",
        note: "For finally finishing the 21K. Wear it with pride!",
        createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      });
    store.put("system", "seed-gift-v1", { complete: true });
  });
}

/**
 * Demo stamps (ADR 0028): Maya already holds the Borobudur stamp, and the organiser (Leo) has a
 * ready code, BORO2026OK, so a visitor can collect their first stamp without switching accounts.
 */
export function seedStamps(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-stamps-v1")) return;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  store.transaction(() => {
    if (store.get("user", "maya")) {
      const chapter: Chapter = {
        id: randomUUID(),
        ownerId: "maya",
        kind: "stamp",
        label: "Finisher, Borobudur Marathon 2026",
        orgId: "marathon-series",
        collection: "marathon-id-2026",
        stamp: "borobudur",
        from: 2026,
        method: "invite",
        audience: "public",
        createdAt: daysAgo(3),
      };
      store.put("chapter", chapter.id, chapter);
      store.put("side-member", "runners:maya", {
        sideId: "runners",
        userId: "maya",
        since: daysAgo(3),
      });
    }
    if (store.get("user", "leo") && !store.get("invite", "BORO2026OK"))
      store.put("invite", "BORO2026OK", {
        code: "BORO2026OK",
        orgId: "marathon-series",
        kind: "stamp",
        label: "Finisher, Borobudur Marathon 2026",
        collection: "marathon-id-2026",
        stamp: "borobudur",
        from: 2026,
        uses: 500,
        used: 0,
        createdBy: "leo",
        createdAt: daysAgo(3),
      });
    store.put("system", "seed-stamps-v1", { complete: true });
  });
}
