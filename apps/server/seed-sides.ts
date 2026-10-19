import type { SocialService } from "../../packages/core/src/social.js";
import type { SidesService } from "../../packages/core/src/sides.js";
import type { Experience, Metadata } from "../../packages/contracts/src/experience.js";

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
const track = page(
  "Thursday track · who's in?",
  `<style>*{box-sizing:border-box;margin:0}body{background:#e9f3ee;color:#13302a;font-family:${sans}}main{min-height:560px;padding:26px 22px}h1{font:400 58px/.9 ${condensed};text-transform:uppercase}.lane{margin-top:22px;border-radius:999px;padding:14px 18px;background:#fff;border:2px solid #0f8b8d;display:flex;justify-content:space-between;font-weight:700}.lane+.lane{margin-top:10px}.lane small{font-weight:400;opacity:.7}p{margin-top:22px;font-size:15px;line-height:1.5}</style><main><h1>Thursday<br>track night</h1><div class="lane">8 × 400 m <small>lane 1 · 19:30</small></div><div class="lane">4 × 800 m <small>lane 2 · 19:30</small></div><div class="lane">Easy 5K <small>outer lanes · 19:45</small></div><p>Senayan track, Thursday. Bring water, bring someone slower than you so you feel fast.</p></main>`,
);
const jury = page(
  "Jury notes · day 1",
  `<style>*{box-sizing:border-box;margin:0}body{background:#0f1733;color:#eef1ff;font-family:${sans}}main{min-height:560px;padding:26px 22px}small{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#8fb0ff}h1{font:400 52px/.95 ${condensed};text-transform:uppercase;margin-top:8px}ol{margin:20px 0 0 20px;font-size:15px;line-height:1.7}p{margin-top:18px;font-size:14px;opacity:.8}</style><main><small>CREW AND JURY ONLY</small><h1>Day one,<br>eleven shorts</h1><ol><li>Hujan di Bulan Juni: strong, long.</li><li>Kios: the sound mix needs a second look before Friday.</li><li>Lampu Merah: crowd favourite, jury split.</li></ol><p>Nothing here leaves this side until the awards.</p></main>`,
);

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
      owner: "ines",
      pkg: track,
      metadata: {
        title: "Thursday track · who's in?",
        caption: "Senayan, 19:30. Intervals or an easy 5K, your pick.",
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
