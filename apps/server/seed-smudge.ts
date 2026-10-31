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
    { key: "x1", label: "Wrong answer 1a", kind: "text", value: "Purple Rain" },
    { key: "y1", label: "Wrong answer 1b", kind: "text", value: "Dancing Queen" },
    { key: "q2", label: "Clue 2 (emoji)", kind: "text", value: "🧊🧊👶" },
    { key: "a2", label: "Answer 2", kind: "text", value: "Ice Ice Baby" },
    { key: "x2", label: "Wrong answer 2a", kind: "text", value: "Let It Go" },
    { key: "y2", label: "Wrong answer 2b", kind: "text", value: "Baby Shark" },
    { key: "q3", label: "Clue 3 (emoji)", kind: "text", value: "🟡🚢" },
    { key: "a3", label: "Answer 3", kind: "text", value: "Yellow Submarine" },
    { key: "x3", label: "Wrong answer 3a", kind: "text", value: "Octopus's Garden" },
    { key: "y3", label: "Wrong answer 3b", kind: "text", value: "Yellow" },
  ];
  // One clue at a time, three taps to pick from, the next clue right after: a game, not a test.
  const pkg = page(
    "Guess the song from emoji",
    `<script src="smudge/fill.js"></script><style>*{box-sizing:border-box;margin:0}body{background:#140f1f;color:#fff;font-family:${sans};overflow:hidden}main{position:relative;height:520px;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:16px 18px 20px}.bg{position:absolute;inset:-30px;width:calc(100% + 60px);height:calc(100% + 60px);object-fit:cover;filter:blur(18px) brightness(.45) saturate(1.4);z-index:0}main>*:not(.bg){position:relative;z-index:1}.bar{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px}h1{font:400 18px/1 ${condensed};letter-spacing:.04em;text-transform:uppercase;color:#ffd23d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dots{display:flex;gap:6px}.dots i{width:12px;height:12px;border-radius:50%;background:#ffffff33;transition:background .2s,transform .2s}.dots i.now{background:#fff;transform:scale(1.25)}.dots i.right{background:#2fe07a}.dots i.wrong{background:#ff4d6d}#stage{flex:1;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}.card{background:#fff;color:#140f1f;border-radius:26px;padding:20px 26px 14px;transform:rotate(-3deg);box-shadow:0 10px 0 #0005;animation:pop .35s cubic-bezier(.2,1.6,.4,1);text-align:center}.card small{display:block;font:800 11px ${sans};letter-spacing:.14em;color:#8a7fa3;margin-top:6px}#clue{font-size:60px;line-height:1.1;letter-spacing:.06em}.opts{width:100%;max-width:420px;display:grid;gap:12px}.opt{border:0;border-radius:18px;padding:14px 16px;color:#140f1f;font:800 17px ${sans};text-align:left;display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 6px 0 var(--d);background:var(--c);transition:transform .08s,box-shadow .08s,opacity .2s;animation:rise .3s backwards}.opt:nth-child(2){animation-delay:.05s}.opt:nth-child(3){animation-delay:.1s}.opt:active{transform:translateY(5px);box-shadow:0 1px 0 var(--d)}.opt b{font-size:20px;width:26px;text-align:center}.c0{--c:#ff7ac6;--d:#b33d84}.c1{--c:#ffd23d;--d:#b38a14}.c2{--c:#6ee7ff;--d:#2a98b3}.opt.right{--c:#2fe07a;--d:#16924a}.opt.wrong{--c:#ff4d6d;--d:#a8213b;animation:shake .4s}.opt.dim{opacity:.35}#say{position:absolute;top:44%;left:50%;font:400 44px ${condensed};letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;pointer-events:none;animation:say .9s forwards;text-shadow:0 4px 0 #0007}#score{font:400 96px/1 ${condensed};color:#ffd23d;text-shadow:0 6px 0 #0006;animation:pop .45s cubic-bezier(.2,1.6,.4,1)}.end{text-align:center;display:grid;gap:10px;justify-items:center}.end p{font:800 20px ${sans}}.end span{font-size:56px;animation:pop .5s cubic-bezier(.2,1.6,.4,1)}#again{border:0;border-radius:18px;padding:14px 28px;margin-top:6px;background:#fff;color:#140f1f;font:800 17px ${sans};box-shadow:0 6px 0 #0006;cursor:pointer}#again:active{transform:translateY(5px);box-shadow:0 1px 0 #0006}@keyframes pop{from{transform:scale(.4) rotate(-12deg);opacity:0}}@keyframes rise{from{transform:translateY(18px);opacity:0}}@keyframes shake{25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-4px)}}@keyframes say{0%{transform:translate(-50%,-50%) scale(.3) rotate(-8deg);opacity:0}25%{transform:translate(-50%,-50%) scale(1.15) rotate(-4deg);opacity:1}75%{opacity:1}100%{transform:translate(-50%,-90%) scale(1) rotate(-4deg);opacity:0}}@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}</style><main><img class="bg" data-fill="photo" alt=""><div class="bar"><h1 data-fill="title"></h1><div class="dots" id="dots"></div></div><div id="stage"></div></main><script>const v=window.smudgeFill.values,keys=["1","2","3"],stage=document.getElementById("stage"),dots=document.getElementById("dots"),main=document.querySelector("main"),marks=["▲","●","■"],verdicts=["💀 Ouch. Your turn to make one?","🙈 Close-ish.","😎 Not bad at all.","🏆 Song wizard."];let i=0,n=0,busy=false,results=[];function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}function paintDots(){dots.replaceChildren(...keys.map((_,j)=>el("i",results[j]||(j===i?"now":""))))}function say(text,color){const s=el("div","",text);s.id="say";s.style.color=color;main.append(s);setTimeout(()=>s.remove(),900)}function done(score,saved){results=keys.map((_,j)=>results[j]||(j<score?"right":""));i=keys.length;paintDots();const sc=el("div","",score+" / "+keys.length);sc.id="score";const again=el("button","","Play again");again.id="again";again.onclick=()=>{i=0;n=0;results=[];ask()};const end=el("div","end");end.append(el("span","",verdicts[score].split(" ")[0]),sc,el("p","",verdicts[score].slice(verdicts[score].indexOf(" ")+1)),again);stage.replaceChildren(end);if(saved)return;forma.progress.write({score}).catch(()=>{});forma.answers.set({score,of:keys.length}).catch(()=>{})}function ask(){if(i>=keys.length)return done(n);paintDots();const k=keys[i],opts=[v["a"+k],v["x"+k],v["y"+k]],order=[0,1,2].map(j=>(j+i)%3);const card=el("div","card"),clue=el("div","",v["q"+k]);clue.id="clue";card.append(clue,el("small","","WHICH SONG?"));const list=el("div","opts");list.append(...order.map((j,pos)=>{const b=el("button","opt c"+pos);b.append(el("b","",marks[pos]),el("span","",opts[j]));b.setAttribute("aria-label",opts[j]);b.onclick=()=>{if(busy)return;busy=true;const right=j===0;n+=right?1:0;results[i]=right?"right":"wrong";paintDots();for(const o of list.children)if(o!==b&&o.getAttribute("aria-label")!==opts[0])o.classList.add("dim");b.classList.add(right?"right":"wrong");if(!right)for(const o of list.children)if(o.getAttribute("aria-label")===opts[0])o.classList.add("right");say(right?(n===i+1&&i>0?"🔥 "+n+" in a row":"Nice!"):"Nope",right?"#2fe07a":"#ff4d6d");setTimeout(()=>{busy=false;i++;ask()},right?650:1100)};return b}));stage.replaceChildren(card,list)}forma.progress.read().then(s=>{if(typeof s.score==="number")done(s.score,true);else ask()}).catch(()=>ask());</script>`,
    [media.concert],
    ["viewer.progress.read", "viewer.progress.write", "answers.write"],
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
