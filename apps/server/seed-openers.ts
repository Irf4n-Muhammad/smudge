import type { SocialService } from "../../packages/core/src/social.js";
import type { Experience } from "../../packages/contracts/src/experience.js";

/**
 * Opening formats: small things people send to one friend or post for everyone, that ask for one
 * tap back. Each is a fill-in format, so anyone makes their own from a form, and each writes one
 * answer, so friends see who played and Today's format has something to compare.
 */
const sans = `system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
const caps = ["viewer.progress.read", "viewer.progress.write", "answers.write", "answers.read"];
type Field = { key: string; label: string; kind: "text" | "long"; value: string };

function format(name: string, fields: Field[], style: string, body: string, script: string) {
  const pkg = {
    manifest: {
      schemaVersion: 2,
      runtimeVersion: "web-v1",
      name,
      entrypoint: "index.html",
      capabilities: caps,
      assets: [],
    },
    files: {
      "index.html": `<script src="smudge/fill.js"></script><style>*{box-sizing:border-box;margin:0}body{font-family:${sans};overflow:hidden}main{position:relative;height:100vh;min-height:440px;overflow:hidden}.pill{border:0;border-radius:999px;padding:13px 24px;font:800 15px ${sans};cursor:pointer;transition:transform .1s}.pill:active{transform:scale(.96)}.who{font:600 13px/1.35 ${sans};opacity:.85}.who:empty{display:none}@keyframes in{from{opacity:0;transform:translateY(8px)}}@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}${style}</style><main>${body}</main><script>const v=window.smudgeFill.values,$=id=>document.getElementById(id);let played=null;function first(n){return String(n||"").split(" ")[0]}function el(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e}function who(label){const box=$("who");if(!box)return;if(!played||!played.count){box.textContent="";return}const names=played.friends.slice(0,3).map(f=>first(f.name));const rest=played.count-names.length;const bits=names.slice();if(rest>0)bits.push(rest+(names.length?" more":rest===1?" person":" people"));box.textContent=bits.join(", ")+" "+label}function answer(a,label){return forma.answers.set(a).then(r=>{if(r&&typeof r.count==="number"){played=r;who(label)}}).catch(()=>{})}const ready=Promise.all([forma.progress.read().catch(()=>({})),forma.answers.read().catch(()=>null)]).then(([s,a])=>{if(a&&typeof a.count==="number")played=a;return s||{}});${script}</script>`,
      "smudge/fill.js": `window.smudgeFill = ${JSON.stringify({ fields })};\n`,
    },
  };
  return pkg as unknown as Experience;
}

/** Will you be my Valentine: Yes is easy to tap, No runs away from the finger. */
const valentine = format(
  "Will you be my Valentine?",
  [
    { key: "ask", label: "The question", kind: "text", value: "Will you be my Valentine?" },
    { key: "from", label: "Signed", kind: "text", value: "from me, obviously" },
    {
      key: "yes",
      label: "What they see after Yes",
      kind: "long",
      value: "I knew it. Dinner's on me, Friday 8pm.",
    },
  ],
  `main{background:radial-gradient(circle at 30% 20%,#ffd1dc,#ff7aa2 55%,#d6336c);color:#3b0a1d;display:grid;place-items:center;text-align:center;padding:24px}.heart{font-size:72px;animation:beat 1.2s infinite}@keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.15)}30%{transform:scale(1)}}h1{font:900 30px/1.1 ${sans};margin:12px 0 6px;text-wrap:balance}small{font:600 14px ${sans};opacity:.75}.row{display:flex;gap:12px;justify-content:center;margin-top:22px;min-height:52px}#yes{background:#3b0a1d;color:#fff;padding:14px 34px;font-size:17px}#no{background:#fff;color:#3b0a1d;position:relative;transition:left .18s,top .18s}#no.free{position:absolute}#done{display:none;font:700 19px/1.35 ${sans};max-width:320px;margin:18px auto 0;animation:in .4s}main.said #done{display:block}main.said .row{display:none}.who{margin-top:16px}`,
  `<div><div class="heart">💘</div><h1 data-fill="ask"></h1><small data-fill="from"></small><div class="row"><button class="pill" id="yes">Yes</button><button class="pill" id="no">No</button></div><p id="done" data-fill="yes"></p><p class="who" id="who"></p></div>`,
  `const main=document.querySelector("main"),no=$("no");let runs=0;function run(e){if(e)e.preventDefault();runs++;const r=main.getBoundingClientRect(),b=no.getBoundingClientRect();no.classList.add("free");no.style.left=Math.max(8,Math.random()*(r.width-b.width-16))+"px";no.style.top=Math.max(8,Math.random()*(r.height-b.height-16))+"px";if(runs>4)no.textContent=["Nope","Try again","Really?","😅"][runs%4]}no.addEventListener("pointerenter",run);no.addEventListener("pointerdown",run);no.addEventListener("click",run);function yes(saved){main.classList.add("said");who("said yes");if(saved)return;forma.progress.write({yes:true}).catch(()=>{});answer({score:1,of:1},"said yes")}$("yes").onclick=()=>yes(false);ready.then(s=>{if(s.yes)yes(true);else who("said yes")});`,
);

/** Help me choose: two options, one tap, then how everyone split. */
const choose = format(
  "Help me choose",
  [
    { key: "ask", label: "The question", kind: "text", value: "Which one do I wear tonight?" },
    { key: "a", label: "Option A", kind: "text", value: "🖤 The black jacket" },
    { key: "b", label: "Option B", kind: "text", value: "🤍 The cream knit" },
  ],
  `main{background:#14161c;color:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding:22px;gap:14px}.tag{font:800 11px ${sans};letter-spacing:.14em;color:#9aa3b5}h1{font:800 28px/1.15 ${sans};text-wrap:balance}.opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}.opt{position:relative;overflow:hidden;border:1px solid #ffffff26;border-radius:18px;padding:26px 14px;background:#ffffff12;color:#fff;font:800 17px/1.25 ${sans};cursor:pointer;text-align:center;min-height:130px}.opt .bar{position:absolute;left:0;bottom:0;height:0;width:100%;background:#7c5cff66;transition:height .6s ease-out}.opt span{position:relative}.opt b{position:relative;display:block;font:900 30px ${sans};margin-top:10px;opacity:0;transition:opacity .4s}main.voted .opt b{opacity:1}main.voted .opt{cursor:default}.opt.mine{border-color:#c4b5fd;box-shadow:0 0 0 2px #c4b5fd inset}`,
  `<span class="tag">HELP ME CHOOSE</span><h1 data-fill="ask"></h1><div class="opts"><button class="opt" data-k="a"><i class="bar"></i><span data-fill="a"></span><b></b></button><button class="opt" data-k="b"><i class="bar"></i><span data-fill="b"></span><b></b></button></div><p class="who" id="who"></p>`,
  `const main=document.querySelector("main"),opts=[...document.querySelectorAll(".opt")];function split(mine){const votes={a:0,b:0};if(played){for(const f of played.friends)if(f.pick===v.a)votes.a++;else if(f.pick===v.b)votes.b++}if(mine&&!(played&&played.mine))votes[mine]++;if(played&&played.mine){if(played.mine.pick===v.a)votes.a++;else if(played.mine.pick===v.b)votes.b++}const all=Math.max(1,votes.a+votes.b);for(const o of opts){const k=o.dataset.k,p=Math.round(votes[k]/all*100);o.querySelector(".bar").style.height=p+"%";o.querySelector("b").textContent=p+"%";o.classList.toggle("mine",k===mine)}}function vote(k,saved){main.classList.add("voted");split(k);who("helped");if(saved)return;forma.progress.write({pick:k}).catch(()=>{});answer({pick:v[k]},"helped").then(()=>split(k))}for(const o of opts)o.onclick=()=>{if(!main.classList.contains("voted"))vote(o.dataset.k,false)};ready.then(s=>{if(s.pick==="a"||s.pick==="b")vote(s.pick,true);else who("helped")});`,
);

/** Scratch to reveal: guess first, then scratch the card to see if you were right. */
const scratch = format(
  "Scratch to reveal",
  [
    { key: "ask", label: "The question", kind: "text", value: "Guess where I'm moving next year" },
    { key: "answer", label: "The real answer (under the scratch)", kind: "text", value: "Tokyo" },
    { key: "w1", label: "Wrong guess 1", kind: "text", value: "Berlin" },
    { key: "w2", label: "Wrong guess 2", kind: "text", value: "Melbourne" },
    {
      key: "note",
      label: "A line under the answer",
      kind: "text",
      value: "New job, starting in April. Visit me!",
    },
  ],
  `main{background:linear-gradient(160deg,#0f2027,#203a43 50%,#2c5364);color:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding:22px;gap:12px}h1{font:800 26px/1.15 ${sans};text-wrap:balance}.guesses{display:grid;gap:8px}.g{border:1px solid #ffffff33;border-radius:14px;padding:13px 16px;background:#ffffff14;color:#fff;font:700 16px ${sans};text-align:left;cursor:pointer}.card{position:relative;height:150px;border-radius:18px;overflow:hidden;display:none;background:#fff;color:#0f2027;place-items:center;text-align:center;padding:16px}main.guessed .card{display:grid}main.guessed .guesses{display:none}.card strong{display:block;font:900 34px ${sans}}.card small{font:600 13px ${sans};opacity:.7}canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}.hint{font:600 13px ${sans};opacity:.8}`,
  `<h1 data-fill="ask"></h1><div class="guesses" id="guesses"></div><div class="card"><div><strong data-fill="answer"></strong><small data-fill="note"></small></div><canvas id="foil"></canvas></div><p class="hint" id="hint"></p><p class="who" id="who"></p>`,
  `const main=document.querySelector("main"),c=$("foil"),x=c.getContext("2d");let guess=null,open=false;function foil(){const r=c.getBoundingClientRect();c.width=r.width;c.height=r.height;const g=x.createLinearGradient(0,0,r.width,r.height);g.addColorStop(0,"#b8b8b8");g.addColorStop(.5,"#e8e8e8");g.addColorStop(1,"#a0a0a0");x.fillStyle=g;x.fillRect(0,0,r.width,r.height);x.fillStyle="#555";x.font="800 16px system-ui";x.textAlign="center";x.fillText("SCRATCH HERE",r.width/2,r.height/2+6);x.globalCompositeOperation="destination-out"}function reveal(){if(open)return;open=true;c.style.transition="opacity .4s";c.style.opacity="0";$("hint").textContent=guess===v.answer?"You got it.":"You guessed "+guess+"."}let down=false,scratched=0;function at(e){const r=c.getBoundingClientRect();x.beginPath();x.arc(e.clientX-r.left,e.clientY-r.top,22,0,7);x.fill();if(++scratched>28)reveal()}c.onpointerdown=e=>{down=true;at(e)};c.onpointermove=e=>{if(down)at(e)};window.onpointerup=()=>{down=false};function pick(g,saved){guess=g;main.classList.add("guessed");foil();$("hint").textContent="Now scratch the card.";who("guessed");if(saved){reveal();return}forma.progress.write({guess:g}).catch(()=>{});answer({pick:g},"guessed")}const order=[v.w1,v.answer,v.w2];$("guesses").replaceChildren(...order.map(g=>{const b=el("button","g",g);b.onclick=()=>pick(g,false);return b}));ready.then(s=>{if(typeof s.guess==="string")pick(s.guess,true);else who("guessed")});`,
);

/** Beat my score: tap as fast as you can for five seconds, against the maker's number. */
const tapGame = format(
  "Beat my score",
  [
    { key: "ask", label: "Your challenge", kind: "text", value: "Five seconds. Beat my taps." },
    { key: "mine", label: "Your score (taps)", kind: "text", value: "38" },
  ],
  `main{background:#101010;color:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding:22px;gap:14px}h1{font:900 30px/1.1 ${sans};text-wrap:balance}.target{font:700 14px ${sans};color:#facc15}#pad{border:0;border-radius:24px;height:200px;background:#facc15;color:#101010;font:900 64px ${sans};font-variant-numeric:tabular-nums;cursor:pointer;touch-action:manipulation;user-select:none;transition:transform .05s}#pad:active{transform:scale(.97)}#pad.off{background:#2a2a2a;color:#fff;font-size:22px}.bar{height:6px;border-radius:3px;background:#2a2a2a;overflow:hidden}.bar i{display:block;height:100%;width:100%;background:#facc15;transform-origin:left;transform:scaleX(0)}#verdict{font:800 18px ${sans}}`,
  `<h1 data-fill="ask"></h1><p class="target" id="target"></p><div class="bar"><i id="time"></i></div><button id="pad" class="off">Tap to start</button><p id="verdict"></p><p class="who" id="who"></p>`,
  `const pad=$("pad"),time=$("time"),goal=Math.max(1,Math.min(100,parseInt(v.mine,10)||30));$("target").textContent="To beat: "+goal+" taps";let taps=0,end=0,state="idle";function tick(){const left=Math.max(0,end-Date.now());time.style.transform="scaleX("+(left/5000)+")";if(left>0)requestAnimationFrame(tick);else finish(taps,false)}function finish(n,saved){state="done";pad.classList.add("off");pad.textContent="Play again";$("verdict").textContent=n>goal?n+" taps. You beat it.":n===goal?n+" taps. A tie.":n+" taps. "+(goal-n)+" short.";who("played");if(saved)return;const score=Math.min(100,n);forma.progress.write({best:score}).catch(()=>{});answer({score,of:100},"played")}pad.onpointerdown=e=>{e.preventDefault();if(state==="run"){taps++;pad.textContent=taps;return}taps=0;end=Date.now()+5000;state="run";pad.classList.remove("off");pad.textContent="0";$("verdict").textContent="";tick()};ready.then(s=>{if(typeof s.best==="number")finish(s.best,true);else who("played")});`,
);

/** Guess the score: call the result before kickoff, then compare with friends. */
const scoreGuess = format(
  "Guess the score",
  [
    { key: "home", label: "Home team", kind: "text", value: "Lions" },
    { key: "away", label: "Away team", kind: "text", value: "Harbour FC" },
    { key: "when", label: "Kickoff", kind: "text", value: "Saturday, 19:30" },
    { key: "mine", label: "Your call", kind: "text", value: "2-1" },
  ],
  `main{background:linear-gradient(180deg,#0b3d2e,#0a2a20);color:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding:22px;gap:14px}.tag{font:800 11px ${sans};letter-spacing:.14em;color:#86efac}.teams{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;text-align:center}.team b{display:block;font:800 17px ${sans};margin-bottom:8px}.step{display:flex;align-items:center;justify-content:center;gap:8px}.step button{width:36px;height:36px;border-radius:50%;border:1px solid #ffffff40;background:#ffffff14;color:#fff;font:800 18px ${sans};cursor:pointer}.n{font:900 44px ${sans};width:44px;font-variant-numeric:tabular-nums}.dash{font:900 30px ${sans};opacity:.6}.pill{background:#86efac;color:#0a2a20;align-self:flex-start}.calls{display:flex;flex-wrap:wrap;gap:6px}.calls span{background:#ffffff14;border-radius:999px;padding:6px 11px;font:700 13px ${sans}}main.called .step button{display:none}`,
  `<span class="tag" id="tag"></span><div class="teams"><div class="team"><b data-fill="home"></b><div class="step"><button data-t="h" data-d="-1">−</button><span class="n" id="h">0</span><button data-t="h" data-d="1">+</button></div></div><span class="dash">–</span><div class="team"><b data-fill="away"></b><div class="step"><button data-t="a" data-d="-1">−</button><span class="n" id="a">0</span><button data-t="a" data-d="1">+</button></div></div></div><button class="pill" id="call">Lock my call</button><div class="calls" id="calls"></div><p class="who" id="who"></p>`,
  `$("tag").textContent="GUESS THE SCORE · "+String(v.when||"").toUpperCase();const main=document.querySelector("main"),s={h:0,a:0};function show(){$("h").textContent=s.h;$("a").textContent=s.a}for(const b of document.querySelectorAll(".step button"))b.onclick=()=>{const t=b.dataset.t;s[t]=Math.max(0,Math.min(9,s[t]+Number(b.dataset.d)));show()};function calls(){const list=[["Maker",v.mine]];if(played)for(const f of played.friends)if(f.pick)list.push([first(f.name),f.pick]);$("calls").replaceChildren(...list.map(([n,p])=>el("span","",n+" "+p)))}function lock(pick,saved){const [h,a]=pick.split("-").map(Number);s.h=h;s.a=a;show();main.classList.add("called");$("call").textContent="Your call: "+pick;$("call").disabled=true;calls();who("called it");if(saved)return;forma.progress.write({pick}).catch(()=>{});answer({pick},"called it").then(calls)}$("call").onclick=()=>lock(s.h+"-"+s.a,false);ready.then(st=>{if(typeof st.pick==="string")lock(st.pick,true);else{calls();who("called it")}});`,
);

/** A birthday card that stays locked until midnight on the day; until then, friends sign it. */
const birthday = (day: string) =>
  format(
    "Birthday card",
    [
      { key: "name", label: "Whose birthday", kind: "text", value: "Dani" },
      { key: "date", label: "The day (YYYY-MM-DD)", kind: "text", value: day },
      {
        key: "message",
        label: "The card, opened at midnight",
        kind: "long",
        value: "Happy birthday! Another year of you being the loudest laugh in every room. 🎂",
      },
    ],
    `main{background:radial-gradient(circle at 50% 0%,#fde68a,#f59e0b 60%,#b45309);color:#3a1d03;display:grid;place-items:center;text-align:center;padding:24px}.lock{font-size:56px}h1{font:900 28px/1.15 ${sans};margin:10px 0 4px;text-wrap:balance}#count{font:900 40px ${sans};font-variant-numeric:tabular-nums;letter-spacing:.02em}small{font:600 13px ${sans};opacity:.75}.pill{background:#3a1d03;color:#fff;margin-top:18px}#card{display:none;max-width:340px;background:#fffbeb;border-radius:20px;padding:24px;box-shadow:0 20px 40px -20px #0008;font:600 18px/1.45 ${sans};animation:in .5s}main.open #card{display:block}main.open #locked{display:none}.who{margin-top:14px}`,
    `<div><div id="locked"><div class="lock">🔒🎁</div><h1 id="title"></h1><div id="count"></div><small>opens at 00:00 on the day</small><br><button class="pill" id="sign">Sign the card</button></div><div id="card"><div style="font-size:44px">🎂</div><h1 id="title2"></h1><p data-fill="message"></p></div><p class="who" id="who"></p></div>`,
    `const main=document.querySelector("main"),day=/^\\d{4}-\\d{2}-\\d{2}$/.test(v.date)?v.date:new Date().toISOString().slice(0,10),opens=new Date(day+"T00:00:00");$("title").textContent="For "+v.name;$("title2").textContent="Happy birthday, "+v.name;function pad(n){return String(n).padStart(2,"0")}function tick(){const left=opens-Date.now();if(left<=0){main.classList.add("open");return}const h=Math.floor(left/36e5),m=Math.floor(left%36e5/6e4),s=Math.floor(left%6e4/1e3);$("count").textContent=(h>=48?Math.floor(h/24)+"d ":"")+pad(h>=48?h%24:h)+":"+pad(m)+":"+pad(s);setTimeout(tick,1000)}tick();function signed(saved){const b=$("sign");b.textContent="You signed it";b.disabled=true;who("signed");if(saved)return;forma.progress.write({signed:true}).catch(()=>{});answer({score:1,of:1},"signed")}$("sign").onclick=()=>signed(false);ready.then(s=>{if(s.signed)signed(true);else who("signed")});`,
  );

const openers = (
  tomorrow: string,
): {
  key: string;
  owner: string;
  pkg: Experience;
  title: string;
  caption: string;
  played: [string, Record<string, unknown>][];
}[] => [
  {
    key: "valentine",
    owner: "dani",
    pkg: valentine,
    title: "Will you be my Valentine?",
    caption: "Try saying no. Then make one for your person.",
    played: [["leo", { score: 1, of: 1 }]],
  },
  {
    key: "choose",
    owner: "ines",
    pkg: choose,
    title: "Help me choose",
    caption: "Leaving in 20 minutes. Vote fast.",
    played: [
      ["maya", { pick: "🖤 The black jacket" }],
      ["leo", { pick: "🤍 The cream knit" }],
      ["dani", { pick: "🖤 The black jacket" }],
    ],
  },
  {
    key: "scratch",
    owner: "maya",
    pkg: scratch,
    title: "Scratch to reveal",
    caption: "Guess first. No cheating.",
    played: [
      ["ines", { pick: "Tokyo" }],
      ["dani", { pick: "Berlin" }],
    ],
  },
  {
    key: "tap",
    owner: "leo",
    pkg: tapGame,
    title: "Beat my score",
    caption: "38 taps in 5 seconds. Your move.",
    played: [
      ["maya", { score: 41, of: 100 }],
      ["ines", { score: 29, of: 100 }],
    ],
  },
  {
    key: "score",
    owner: "dani",
    pkg: scoreGuess,
    title: "Guess the score",
    caption: "Lions vs Harbour on Saturday. Call it before kickoff.",
    played: [
      ["leo", { pick: "2-1" }],
      ["maya", { pick: "1-1" }],
    ],
  },
  {
    key: "birthday",
    owner: "maya",
    pkg: birthday(tomorrow),
    title: "Dani's birthday card",
    caption: "Locked until midnight. Sign it before then.",
    played: [
      ["leo", { score: 1, of: 1 }],
      ["ines", { score: 1, of: 1 }],
    ],
  },
];

/** Adds the opening formats once, each with a few friends who already played. */
export function seedOpeners(service: SocialService, now = new Date()) {
  const store = service.store;
  if (store.get("system", "seed-openers-v1")) return;
  // The birthday is tomorrow, so the card starts locked with a countdown.
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  for (const o of openers(tomorrow)) {
    if (!store.get("user", o.owner)) continue;
    const actor = { userId: o.owner };
    const draft = service.createDraft(actor, {
      package: o.pkg,
      metadata: { title: o.title, caption: o.caption, format: "custom", contributors: [] },
    });
    service.publish(actor, draft.id, draft.revision, (post) => {
      for (const [userId, a] of o.played)
        if (store.get("user", userId))
          store.put("answer", `${post.id}:${userId}`, {
            postId: post.id,
            userId,
            ...a,
            at: post.createdAt,
          });
    });
  }
  store.transaction(() => store.put("system", "seed-openers-v1", { complete: true }));
}
