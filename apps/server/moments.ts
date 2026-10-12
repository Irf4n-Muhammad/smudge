import type { Experience } from "../../packages/contracts/src/experience.js";
import type { MomentRenderContext } from "../../packages/core/src/identity.js";

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");

const kicker: Record<string, string> = {
  graduation: "Graduation",
  "new-job": "New job",
  birthday: "Birthday",
  trip: "Trip",
  together: "Together",
  milestone: "Who I am",
  paper: "Paper",
};

/**
 * Cinematic moment page (dark, counter intro, decoding titles, optional ambient sound after a
 * tap). Visual design is a placeholder for a designer pass; the structure and data are final.
 * The "verified" mark is drawn by the host outside the frame, never inside copyable source.
 */
export function renderMoment(context: MomentRenderContext): Experience {
  const { input, owner, chapter, org, partner } = context;
  const assets = [
    ...new Set(
      [input.coverAssetId, ...input.sections.map((s) => s.assetId)].filter(
        (id): id is string => !!id,
      ),
    ),
  ];
  const cover = input.coverAssetId ? `asset:${input.coverAssetId}` : "";
  const meta: [string, string][] = [["Name", owner.name]];
  if (partner) meta.push(["With", partner.name]);
  if (org) meta.push([org.kind === "campus" ? "Campus" : "Where", org.name]);
  if (chapter && chapter.kind !== "together") meta.push(["Chapter", chapter.label]);
  if (chapter?.from) meta.push(["Years", `${chapter.from} to ${chapter.to ?? "now"}`]);
  const sections = input.sections
    .map(
      (s, i) =>
        `<section class="ch"><div class="ix mono"><span>${String(i + 1).padStart(2, "0")} / ${String(input.sections.length).padStart(2, "0")}</span><span>${esc(s.note)}</span></div><h2 class="wide dc" data-t="${esc(s.heading)}">${esc(s.heading)}</h2>${s.assetId ? `<div class="ph2"><img src="asset:${s.assetId}" alt=""></div>` : ""}${s.text ? `<p class="body">${esc(s.text)}</p>` : ""}</section>`,
    )
    .join("");
  const paper = input.paper
    ? `<section class="ch paper"><div class="ix mono"><span>${input.kind === "paper" ? "Paper" : "Final work"}</span><span>${Math.max(1, Math.round(input.paper.body.split(/\s+/).length / 230))} min read</span></div><button class="pap" id="pap" aria-expanded="false"><span class="t">${esc(input.paper.title)}</span>${input.paper.abstract ? `<span class="ab">${esc(input.paper.abstract)}</span>` : ""}<span class="r mono"><span>Tap to read</span><span id="papSign">+</span></span></button><div class="rd" id="rd" hidden>${paragraphs(input.paper.body)}${input.paper.link ? `<p class="mono src">Source: ${esc(input.paper.link)}</p>` : ""}</div></section>`
    : "";
  const html = `<style>
html,body{background:#000;color:#f3f3f3}body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
button{background:none;border:0;color:inherit;padding:0}img{display:block}[hidden]{display:none!important}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;text-transform:uppercase;letter-spacing:.08em}
.wide{font-weight:200;text-transform:uppercase;letter-spacing:.01em;font-stretch:125%}
.page{max-width:560px;margin:0 auto}
.brk{position:relative;display:inline-block;background:#fff;color:#000;font:500 11px ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;padding:11px 20px}
.brk:before{content:"";position:absolute;inset:-6px;pointer-events:none;background:linear-gradient(#fff,#fff) 0 0/5px 1px,linear-gradient(#fff,#fff) 0 0/1px 5px,linear-gradient(#fff,#fff) 100% 0/5px 1px,linear-gradient(#fff,#fff) 100% 0/1px 5px,linear-gradient(#fff,#fff) 0 100%/5px 1px,linear-gradient(#fff,#fff) 0 100%/1px 5px,linear-gradient(#fff,#fff) 100% 100%/5px 1px,linear-gradient(#fff,#fff) 100% 100%/1px 5px;background-repeat:no-repeat}
.intro{position:fixed;inset:0;z-index:5;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center;padding:24px;transition:opacity .9s,visibility 0s .9s}
.intro.gone{opacity:0;visibility:hidden}.count{font-size:13px;opacity:.75;height:18px}
.reveal{font-size:clamp(30px,10vw,52px);line-height:1;min-height:1em;letter-spacing:.06em}
.intro .sub{font-size:10px;opacity:0;max-width:32ch;line-height:1.7;transition:opacity .8s}
.intro .gate{opacity:0;transform:translateY(8px);transition:opacity .8s,transform .8s}
.intro.ready .sub,.intro.ready .gate{opacity:1;transform:none}
.intro .hp{position:absolute;bottom:24px;left:0;right:0;font-size:9.5px;opacity:.5}
.blurbg{position:absolute;inset:0;z-index:-1;opacity:0;transition:opacity 2s}.blurbg img{width:100%;height:100%;object-fit:cover;filter:blur(28px) brightness(.45);transform:scale(1.2)}
.intro.ready .blurbg{opacity:1}
.bar{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;padding:12px 16px 20px;background:linear-gradient(180deg,rgba(0,0,0,.8),transparent);font-size:10.5px}
.hero{position:relative;height:92vh;min-height:520px;margin-top:-46px;overflow:hidden;background:#111}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(14px) grayscale(.6) brightness(.5);transform:scale(1.15);transition:filter 2.4s,transform 3s}
.hero.live img{filter:none;filter:brightness(.62);transform:scale(1.02)}
.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.2),transparent 30%,rgba(0,0,0,.85) 92%)}
.hero .c{position:absolute;z-index:2;left:20px;right:20px;bottom:40px}
.hero .k{font-size:10px;opacity:.7}.hero h1{margin:10px 0 18px;font-size:clamp(38px,12vw,64px);line-height:.95}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-size:10px;opacity:.85}.meta span:nth-child(odd){opacity:.55}
.story{padding:60px 20px 0;font-weight:300;font-size:18px;line-height:1.6;opacity:.9}
.ch{padding:80px 20px 20px}.ch .ix{font-size:10px;opacity:.55;display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,.18);padding-top:10px}
.ch h2{margin:20px 0;font-size:clamp(28px,9vw,42px);line-height:1}
.ph2{margin:0 -20px;overflow:hidden;aspect-ratio:4/5;background:#111}.ph2 img{width:100%;height:100%;object-fit:cover;filter:blur(10px) grayscale(1) brightness(.6);transform:scale(1.12);transition:filter 1.6s,transform 2.2s}
.ch.in .ph2 img{filter:brightness(.88);transform:scale(1)}.ch .body{margin:18px 0 0;font-weight:300;font-size:16px;line-height:1.6;opacity:.85}
.pap{margin-top:14px;border:1px solid rgba(255,255,255,.2);padding:16px;display:grid;gap:10px;text-align:left;width:100%}
.pap .t{font-weight:300;font-size:21px;line-height:1.2}.pap .ab{font-size:14px;opacity:.7;line-height:1.55}.pap .r{display:flex;justify-content:space-between;font-size:10px;opacity:.6}
.rd{border-left:1px solid rgba(255,255,255,.3);padding:4px 0 4px 14px;margin-top:14px;font-weight:300;font-size:15px;line-height:1.75;opacity:.88}.rd .src{font-size:10px;opacity:.6}
.ty{padding:100px 20px 30px;text-align:center}.ty .q{font-size:clamp(20px,6.5vw,30px);line-height:1.2;margin:16px 0 0}
.wl{padding:60px 20px 80px}.wl .ix{font-size:10px;opacity:.55;display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,.18);padding-top:10px}
.wall{display:flex;flex-wrap:wrap;gap:8px;min-height:120px;margin-top:18px;padding:14px;border:1px solid rgba(255,255,255,.14)}
.stk{font:500 10.5px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;padding:8px 10px;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.04);animation:inn .5s both}
.stk.me{background:#fff;color:#000}.stk small{display:block;opacity:.55;font-size:9px;margin-top:2px}
@keyframes inn{from{opacity:0;transform:translateY(8px)}}
.pick{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.pick button{font:500 10.5px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;padding:9px 11px;border:1px solid rgba(255,255,255,.35)}
.pick button[aria-pressed=true]{background:#fff;color:#000}.hint{font-size:10px;opacity:.5;margin-top:12px}
</style>
<div class="intro" id="intro">${cover ? `<div class="blurbg"><img src="${cover}" alt=""></div>` : ""}
<div class="count mono" id="count">000</div><div class="reveal wide" id="reveal"></div>
<p class="sub mono">${esc(kicker[input.kind]!)}${chapter ? ` · ${esc(chapter.label)}` : ""}</p>
<button class="gate brk" id="gate">Open moment</button><div class="hp mono">Better with headphones</div></div>
<div class="page"><div class="bar mono"><span>${esc(owner.handle)}</span><button id="snd">Sound: off</button></div>
<header class="hero" id="hero">${cover ? `<img src="${cover}" alt="">` : ""}<div class="c"><span class="k mono">${esc(kicker[input.kind]!)}</span><h1 class="wide dc" data-t="${esc(input.title)}">${esc(input.title)}</h1><div class="meta mono">${meta.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join("")}</div></div></header>
${input.story ? `<div class="story">${esc(input.story)}</div>` : ""}${sections}${paper}
${input.thanks ? `<section class="ty ch"><span class="mono" style="font-size:10px;opacity:.55">Thank you</span><p class="q wide dc" data-t="${esc(input.thanks)}">${esc(input.thanks)}</p></section>` : ""}
<section class="wl"><div class="ix mono"><span>Wall</span><span id="cnt">0</span></div><div class="wall" id="wall"></div><div class="pick" id="pick"></div><p class="hint mono" id="hint">One sticker per person. No likes, no comments here.</p></section></div>
<script>
const $=id=>document.getElementById(id);const RM=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduce';
const GL='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_#';
function decode(el,text,dur){text=text||el.dataset.t||el.textContent;if(RM){el.textContent=text;return Promise.resolve()}return new Promise(res=>{const t0=performance.now();(function f(now){const p=Math.min(1,(now-t0)/dur),n=Math.floor(p*text.length);let s='';for(let i=0;i<text.length;i++){const c=text[i];s+=i<n||c===' '?c:GL[Math.random()*GL.length|0]}el.textContent=s;if(p<1)requestAnimationFrame(f);else{el.textContent=text;res()}})(t0)})}
let ac=null,gain=null,on=false;
function startSound(){try{ac=ac||new AudioContext();gain=ac.createGain();gain.gain.value=0;gain.connect(ac.destination);[196,246.94,293.66,392].forEach((f,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;g.gain.value=.05/(i+1);o.connect(g);g.connect(gain);o.start()});gain.gain.linearRampToValueAtTime(.6,ac.currentTime+2.5);on=true;$('snd').textContent='Sound: on'}catch(e){}}
function stopSound(){if(ac&&gain){gain.gain.linearRampToValueAtTime(0,ac.currentTime+.6);const a=ac;setTimeout(()=>{try{a.close()}catch(e){}},700);ac=null}on=false;$('snd').textContent='Sound: off'}
$('snd').onclick=()=>on?stopSound():startSound();
(async()=>{const c=$('count');if(!RM){for(let v=0;v<=100;v+=1+Math.floor(Math.random()*9)){c.textContent=String(Math.min(v,100)).padStart(3,'0')+' %';await new Promise(r=>setTimeout(r,40))}}c.textContent='100 %';await decode($('reveal'),${JSON.stringify(owner.name.toUpperCase())},1000);$('intro').classList.add('ready')})();
$('gate').onclick=()=>{startSound();$('intro').classList.add('gone');setTimeout(()=>{$('hero').classList.add('live');decode(document.querySelector('.hero h1'),null,1200)},250)};
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&!e.target.classList.contains('in')){e.target.classList.add('in');const h=e.target.querySelector('.dc');if(h)decode(h,null,800)}}),{threshold:.25});
document.querySelectorAll('.ch').forEach(s=>io.observe(s));
if($('pap'))$('pap').onclick=()=>{const r=$('rd');r.hidden=!r.hidden;$('pap').setAttribute('aria-expanded',String(!r.hidden));$('papSign').textContent=r.hidden?'+':'−'};
function render(state){const wall=$('wall');wall.textContent='';state.wall.forEach(w=>{const e=document.createElement('div');e.className='stk';e.textContent=w.label;const s=document.createElement('small');s.textContent=w.name;e.append(s);wall.append(e)});$('cnt').textContent=String(state.wall.length);
const pick=$('pick');pick.textContent='';state.options.forEach(o=>{const b=document.createElement('button');b.textContent=o.label;b.setAttribute('aria-pressed',String(state.mine===o.id));b.onclick=async()=>{try{render(await forma.reactions.place(state.mine===o.id?null:o.id))}catch(e){$('hint').textContent='Could not place that sticker.'}};pick.append(b)})}
forma.reactions.read().then(render).catch(()=>{$('hint').textContent='Stickers are unavailable in preview.'});
</script>`;
  return {
    manifest: {
      schemaVersion: 2,
      runtimeVersion: "web-v1",
      name: `${kicker[input.kind]} moment`,
      entrypoint: "index.html",
      capabilities: ["reactions.read", "reactions.place"],
      assets,
      stage: {
        background: "#000000",
        ink: "#f3f3f3",
        nightBackground: "#000000",
        nightInk: "#f3f3f3",
        height: 760,
      },
    },
    files: { "index.html": html },
  };
}
