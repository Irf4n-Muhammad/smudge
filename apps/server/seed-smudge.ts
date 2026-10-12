import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SocialService } from "../../packages/core/src/social.js";
import type { Experience, Metadata } from "../../packages/contracts/src/experience.js";

const media = {
  concert: "10000000-0000-4000-8000-000000000004",
  spray: "10000000-0000-4000-8000-000000000005",
  rooftop: "10000000-0000-4000-8000-000000000006",
};
// Pages run in the sandboxed runtime, which only loads data: fonts, so these stick to system ones.
const sans = `system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
const condensed = `Impact,"Arial Narrow Bold","Helvetica Neue",sans-serif`;

function page(name: string, html: string, assets: string[], capabilities: string[] = []) {
  return {
    manifest: {
      schemaVersion: 2,
      runtimeVersion: "web-v1",
      name,
      entrypoint: "index.html",
      capabilities,
      assets,
    },
    files: { "index.html": html },
  } as Experience;
}

const festival = page(
  "Fieldnight Festival · Day 2",
  `<style>*{box-sizing:border-box;margin:0}body{background:#0d0b14;color:#f6f1ff;font-family:${sans}}main{min-height:520px;padding-bottom:22px}.hero{position:relative;height:300px;overflow:hidden}.hero img{width:100%;height:100%;object-fit:cover;filter:saturate(1.15) contrast(1.05)}.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#0d0b1400 30%,#0d0b14 96%)}.text{position:absolute;left:20px;right:20px;bottom:8px;z-index:1}.kick{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#c6ff3d}h1{font:400 72px/.88 ${condensed};text-transform:uppercase;margin-top:6px;background:linear-gradient(90deg,#ff5ac8,#ffd23d 55%,#7cf3ff);-webkit-background-clip:text;background-clip:text;color:transparent}.meta{display:flex;gap:14px;margin-top:8px;font:700 12px ui-monospace,Menlo,monospace;color:#d9d2ea}.marq{margin:16px -4px 0;background:#c6ff3d;color:#0d0b14;font:400 18px ${condensed};letter-spacing:.04em;padding:6px 12px;white-space:nowrap;overflow:hidden;transform:rotate(-2deg)}section{padding:18px 18px 0}h2{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#9b92b3;margin-bottom:10px}label{display:flex;align-items:center;justify-content:space-between;border-radius:16px;padding:12px 14px;margin-bottom:8px;background:#1a1626;border:1px solid #ffffff1a;cursor:pointer}label:has(input:checked){background:#f6f1ff;color:#0d0b14}input{position:absolute;opacity:0}label b{font:400 22px ${condensed};letter-spacing:.02em;display:block}label small{font-size:12px;opacity:.65}.price{font:700 16px ui-monospace,Menlo,monospace}button{width:100%;margin-top:8px;border:0;border-radius:18px;padding:16px;background:#c6ff3d;color:#0d0b14;font:400 22px ${condensed};letter-spacing:.03em;cursor:pointer}#done{display:none;margin-top:12px;border-radius:16px;padding:14px;background:#ffffff12;border:1px dashed #c6ff3d;font-size:14px;line-height:1.4}#done.on{display:block}</style><main><div class="hero"><img src="asset:${media.concert}" alt="A crowd with hands in the air in front of a lit stage"><div class="text"><div class="kick">● SAT 18 OCT · LISBON</div><h1>Field<br>night</h1><div class="meta"><span>DAY 2</span><span>GATES 16:00</span><span>ALL AGES</span></div></div></div><div class="marq">NOVA REYES ✦ THE PALMS ✦ KITO ✦ LOW TIDE CLUB ✦</div><section><h2>PICK YOUR TICKET</h2><form id="form"><label><span><b>DAY 2 PASS</b><small>Saturday only</small></span><span class="price">$49</span><input type="radio" name="t" value="Day 2 pass" checked></label><label><span><b>WEEKEND</b><small>Fri + Sat + Sun</small></span><span class="price">$119</span><input type="radio" name="t" value="Weekend pass"></label><button id="buy">I'M GOING →</button></form><p id="done"></p></section></main><script>const form=document.getElementById('form'),done=document.getElementById('done');function show(t){done.textContent="You're going ✦ "+t+". This is a demo page, so nothing was charged. Your pick is saved for next time.";done.classList.add('on');for(const i of form.t)i.checked=i.value===t}form.onsubmit=async e=>{e.preventDefault();const t=form.t.value;show(t);try{await forma.progress.write({ticket:t})}catch{}};forma.progress.read().then(s=>{if(typeof s.ticket==='string')show(s.ticket)}).catch(()=>{});</script>`,
  [media.concert],
  ["viewer.progress.read", "viewer.progress.write"],
);

const wall = page(
  "The wall on Rua das Flores",
  `<style>*{box-sizing:border-box;margin:0}body{font-family:${sans}}main{position:relative;height:480px;background:#111;color:#fff;overflow:hidden}img{width:100%;height:100%;object-fit:cover}section{position:absolute;left:0;right:0;bottom:0;padding:70px 22px 22px;background:linear-gradient(transparent,#000c)}small{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#ffcc00}h1{font:400 44px/.95 ${condensed};text-transform:uppercase;margin-top:8px}p{margin-top:10px;font-size:14px;line-height:1.45;max-width:420px;opacity:.9}</style><main><img src="asset:${media.spray}" alt="An artist spray painting a colourful wall"><section><small>WORK IN PROGRESS · DAY 3</small><h1>Three days,<br>eleven cans.</h1><p>Finished the left half tonight. The owner of the café next door brought us coffee twice.</p></section></main>`,
  [media.spray],
);

const rooftop = page(
  "Saturday, up top",
  `<style>*{box-sizing:border-box;margin:0}body{font-family:${sans}}main{position:relative;height:460px;background:#ddd;overflow:hidden}img{width:100%;height:100%;object-fit:cover}p{position:absolute;left:18px;bottom:18px;background:#fff;color:#121212;padding:8px 12px;border-radius:12px;font:600 14px ${sans};transform:rotate(-2deg);box-shadow:0 6px 18px #0003}</style><main><img src="asset:${media.rooftop}" alt="Four friends laughing with drinks on a rooftop"><p>someone tell a worse joke than Dani</p></main>`,
  [media.rooftop],
);

/** Smudge's launch examples: real people doing real things. Added once, also to existing data. */
export function seedSmudge(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-smudge-v1")) return;
  store.transaction(() => {
    for (const [name, id] of Object.entries(media))
      if (!store.get("asset", id))
        store.put("asset", id, {
          id,
          ownerId: "shared",
          name: `${name}.jpg`,
          mime: "image/jpeg",
          base64: readFileSync(resolve(`assets/demo/${name}.jpg`)).toString("base64"),
        });
  });
  const posts: { owner: string; pkg: Experience; metadata: Metadata }[] = [
    {
      owner: "leo",
      pkg: rooftop,
      metadata: {
        title: "Saturday, up top",
        caption: "No plan, one rooftop, too many bad jokes.",
        format: "photo",
        contributors: [],
        coverAssetId: media.rooftop,
      },
    },
    {
      owner: "ines",
      pkg: wall,
      metadata: {
        title: "The wall on Rua das Flores",
        caption: "Day 3 of the mural. Come by before it's finished.",
        format: "photo",
        contributors: [],
        coverAssetId: media.spray,
        link: { label: "Read the story", url: "https://en.wikipedia.org/wiki/Street_art" },
      },
    },
    {
      owner: "maya",
      pkg: festival,
      metadata: {
        title: "Fieldnight Festival · Day 2",
        caption: "We're going Saturday. Who's in? Tickets are right here.",
        format: "custom",
        contributors: [],
        coverAssetId: media.concert,
        link: { label: "Get tickets" },
      },
    },
  ];
  for (const p of posts) {
    const actor = { userId: p.owner };
    if (!store.get("user", p.owner)) continue;
    const draft = service.createDraft(actor, { package: p.pkg, metadata: p.metadata });
    service.publish(actor, draft.id, draft.revision);
  }
  store.transaction(() => store.put("system", "seed-smudge-v1", { complete: true }));
}
