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

/** A fill-in format: anyone can make their own round from a form, without touching the code. */
const songQuiz = (() => {
  const fields = [
    { key: "title", label: "Title", kind: "text", value: "Guess the song from emoji" },
    { key: "photo", label: "Photo", kind: "image", value: `asset:${media.concert}` },
    { key: "q1", label: "Clue 1 (emoji)", kind: "text", value: "☔️🎤💃" },
    { key: "a1", label: "Answer 1", kind: "text", value: "Singin' in the Rain" },
    { key: "q2", label: "Clue 2 (emoji)", kind: "text", value: "🧊🧊👶" },
    { key: "a2", label: "Answer 2", kind: "text", value: "Ice Ice Baby" },
    { key: "q3", label: "Clue 3 (emoji)", kind: "text", value: "🟡🚢" },
    { key: "a3", label: "Answer 3", kind: "text", value: "Yellow Submarine" },
  ];
  const pkg = page(
    "Guess the song from emoji",
    `<script src="smudge/fill.js"></script><style>*{box-sizing:border-box;margin:0}body{background:#141018;color:#fff;font-family:${sans}}main{min-height:520px}.top{position:relative;height:190px;overflow:hidden}.top img{width:100%;height:100%;object-fit:cover;filter:brightness(.55)}.top h1{position:absolute;left:20px;right:20px;bottom:16px;font:400 40px/.95 ${condensed};text-transform:uppercase;color:#ffd23d}form{padding:16px 18px 20px;display:grid;gap:12px}.q{background:#221c2a;border-radius:16px;padding:12px 14px}.q b{display:block;font-size:34px;letter-spacing:.08em}.q input{width:100%;margin-top:8px;border:0;border-radius:10px;padding:10px;background:#fff;color:#141018}.q.right{outline:2px solid #7cf38f}.q.wrong{outline:2px solid #ff6b6b}.q small{display:block;margin-top:6px;opacity:.75}button{border:0;border-radius:16px;padding:14px;background:#ffd23d;color:#141018;font:400 22px ${condensed};letter-spacing:.03em}#score{text-align:center;font:400 28px ${condensed};color:#ffd23d}</style><main><div class="top"><img data-fill="photo" alt=""><h1 data-fill="title"></h1></div><form id="quiz"></form></main><script>const v=window.smudgeFill.values,keys=["1","2","3"],form=document.getElementById("quiz");const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,"");form.innerHTML=keys.map(k=>'<label class="q" id="q'+k+'"><b></b><input name="a'+k+'" placeholder="Your guess" autocomplete="off"><small></small></label>').join("")+'<button>Check my answers</button><p id="score"></p>';for(const k of keys)form.querySelector("#q"+k+" b").textContent=v["q"+k];function show(guesses){let n=0;for(const k of keys){const box=form.querySelector("#q"+k),ok=norm(guesses[k]||"")===norm(v["a"+k]);n+=ok;box.className="q "+(ok?"right":"wrong");box.querySelector("small").textContent=ok?"Yes!":"It was: "+v["a"+k];box.querySelector("input").value=guesses[k]||""}document.getElementById("score").textContent=n+" / "+keys.length}form.onsubmit=async e=>{e.preventDefault();const g={};for(const k of keys)g[k]=form["a"+k].value;show(g);try{await forma.progress.write({guesses:g})}catch{}};forma.progress.read().then(s=>{if(s.guesses)show(s.guesses)}).catch(()=>{});</script>`,
    [media.concert],
    ["viewer.progress.read", "viewer.progress.write"],
  );
  pkg.files["smudge/fill.js"] = `window.smudgeFill = ${JSON.stringify({ fields })};\n`;
  return pkg;
})();

export function seedFillFormat(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-fill-format-v1") || !store.get("user", "leo")) return;
  if (!store.get("asset", media.concert)) return;
  const actor = { userId: "leo" };
  const draft = service.createDraft(actor, {
    package: songQuiz,
    metadata: {
      title: "Guess the song from emoji",
      caption: "3 songs, only emoji. Beat my score, then make your own round.",
      format: "custom",
      contributors: [],
      coverAssetId: media.concert,
    },
  });
  service.publish(actor, draft.id, draft.revision);
  store.transaction(() => store.put("system", "seed-fill-format-v1", { complete: true }));
}
