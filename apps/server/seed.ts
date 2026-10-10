import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SocialService } from "../../packages/core/src/social.js";
import type { Experience, User } from "../../packages/contracts/src/experience.js";

const media = {
  coast: "10000000-0000-4000-8000-000000000001",
  lake: "10000000-0000-4000-8000-000000000002",
  forest: "10000000-0000-4000-8000-000000000003",
};
const users: User[] = [
  {
    id: "you",
    name: "Alex Morgan",
    handle: "alex",
    initials: "AM",
    color: "#dbe5d2",
    bio: "Collecting little moments. Making room for new ones.",
  },
  {
    id: "maya",
    name: "Maya Chen",
    handle: "mayainframes",
    initials: "MC",
    color: "#f2d2be",
    bio: "A camera, a notebook, and the long way home.",
  },
  {
    id: "leo",
    name: "Leo Park",
    handle: "leopark",
    initials: "LP",
    color: "#d5def0",
    bio: "Stories worth getting a little lost in.",
  },
  {
    id: "ines",
    name: "Inès Laurent",
    handle: "ines.outside",
    initials: "IL",
    color: "#e4dcec",
    bio: "Outside whenever possible. Notes from everywhere.",
  },
];
const base = `body{color:#29251f}button{border:0;border-radius:30px;padding:11px 19px;font-size:12px}small{font-size:10px;letter-spacing:2px;text-transform:uppercase}h1,h2,p{margin:0}button:hover{filter:brightness(.95)}.muted{opacity:.65}`;
function experience(
  name: string,
  html: string,
  options: Partial<Extract<Experience["manifest"], { schemaVersion: 2 }>> = {},
): Experience {
  return {
    manifest: {
      schemaVersion: 2,
      runtimeVersion: "web-v1",
      name,
      entrypoint: "index.html",
      capabilities: [],
      assets: [],
      ...options,
    },
    files: { "index.html": `<style>${base}</style>${html}` },
  };
}
export function starterPackage(): Experience {
  return experience(
    "A little note",
    `<style>main{min-height:420px;background:#ece9e0;display:grid;place-content:center;padding:45px;text-align:center}h1{font:italic 46px Georgia;margin:20px 0}button{background:#d9563b;color:white;margin-top:24px}</style><main><small>A page from my day</small><h1>The little things.</h1><p id="note">Something worth keeping.</p><button onclick="document.getElementById('note').textContent='You found the small surprise. ✦'">Open a little surprise ↗</button></main>`,
  );
}
export async function seed(service: SocialService) {
  if (service.store.get("system", "seed-v1")) return;
  service.store.transaction(() => {
    for (const user of users) service.store.put("user", user.id, user);
    for (const [name, id] of Object.entries(media))
      service.store.put("asset", id, {
        id,
        ownerId: "shared",
        name: `${name}.jpg`,
        mime: "image/jpeg",
        base64: readFileSync(resolve(`assets/demo/${name}.jpg`)).toString("base64"),
      });
  });
  const photo = experience(
    "Somewhere quiet",
    `<style>main{height:460px;position:relative;background:#2a3d33;color:#fff}img{width:100%;height:100%;object-fit:cover}section{position:absolute;bottom:0;left:0;right:0;padding:60px 32px 30px;background:linear-gradient(transparent,#142d28c9)}h1{font:italic 44px Georgia;margin-top:12px}</style><main><img src="asset:${media.forest}" alt="Sunlight falling through a green forest"><section><small>FIELD NOTES / 003</small><h1>Somewhere quiet.</h1><p style="margin-top:12px;font-size:13px">No itinerary. Just this.</p></section></main>`,
    { assets: [media.forest] },
  );
  const shared = experience(
    "The weekend, together",
    `<style>main{background:#e7edf0;min-height:460px;padding:28px}h1{font:35px Georgia;margin:12px 0}#notes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:25px 0}article{background:#fffbea;padding:18px;min-height:105px;box-shadow:2px 4px 0 #253f4710;transform:rotate(-2deg);font:17px Georgia}article:nth-child(even){background:#e1e7d2;transform:rotate(2deg)}input{width:100%;border:1px solid #b9c6cb;padding:12px;background:#ffffff8c;border-radius:8px;margin-bottom:10px}button{background:#2d484e;color:white}#status{font-size:12px;margin-top:10px}</style><main><small>A SHARED MEMORY</small><h1>Same weekend.<br>Different little moments.</h1><div id="notes"><article>That wrong turn was the best part.<br><small>— Maya</small></article><article>The coffee stop. Obviously.<br><small>— Alex</small></article></div><form id="form"><input aria-label="Your memory" id="text" placeholder="What do you remember?" maxlength="500" required><button>Add your memory +</button></form><p id="status">Alex and Maya can add a note. Everyone can read.</p></main><script>async function refresh(){const notes=await forma.contributions.list();for(const n of notes){const el=document.createElement('article');el.textContent=n.text;document.getElementById('notes').append(el)}}refresh().catch(()=>{});document.getElementById('form').onsubmit=async e=>{e.preventDefault();const text=document.getElementById('text');try{await forma.contributions.add({text:text.value});const note=document.createElement('article');note.textContent=text.value;document.getElementById('notes').append(note);text.value='';document.getElementById('status').textContent='Your memory is here to stay.'}catch(e){document.getElementById('status').textContent=e.message==='CONTRIBUTOR_REQUIRED'?'This notebook is open to Alex and Maya only.':e.message}};</script>`,
    { capabilities: ["contributions.read", "contributions.create"] },
  );
  const story = experience(
    "Take the scenic route",
    `<style>main{position:relative;height:460px;background:#20352e;color:#fff;overflow:hidden}img{position:absolute;width:100%;height:100%;object-fit:cover;filter:brightness(.58)}section{position:relative;padding:35px;height:100%;display:flex;flex-direction:column;align-items:flex-start}h1{font:italic 48px Georgia;margin:auto 0 18px;max-width:350px}p{font-size:13px;line-height:1.6;max-width:360px;margin-bottom:24px}nav{display:flex;gap:10px;flex-wrap:wrap}button{background:#f5f2e8;color:#22392e}.secondary{background:#ffffff20;color:white;border:1px solid #ffffff70}#results{font-size:11px;margin-top:16px;min-height:15px}</style><main><img src="asset:${media.lake}" alt="An alpine lake surrounded by mountains"><section><small id="chapter">AN INTERACTIVE STORY / 01</small><h1 id="title">Take the<br>scenic route.</h1><p id="copy">Two paths. One afternoon. Where should we go next?</p><nav><button id="lake">Follow the lake ↗</button><button class="secondary" id="woods">Into the woods ↗</button></nav><div id="results">You choose how this story unfolds.</div></section></main><script>async function choose(option){await forma.progress.write({chapter:option});const result=await forma.poll.vote(option);render(option,result)}function render(option,result){document.getElementById('chapter').textContent='AN INTERACTIVE STORY / 02';document.getElementById('title').textContent=option===0?'A place to linger.':'A little further in.';document.getElementById('copy').textContent=option===0?'We stayed until the water turned gold. Sometimes the best plan is no plan.':'The path grew quiet. Then the trees opened into a clearing we almost missed.';document.getElementById('results').textContent=result?result.counts.map((n,i)=>result.options[i]+': '+n).join(' · '):'Your place in this story was saved.'}document.getElementById('lake').onclick=()=>choose(0);document.getElementById('woods').onclick=()=>choose(1);forma.progress.read().then(state=>{if(typeof state.chapter==='number')render(state.chapter)});</script>`,
    {
      assets: [media.lake],
      capabilities: ["viewer.progress.read", "viewer.progress.write", "polls.read", "polls.vote"],
      poll: { question: "Where next?", options: ["The lake", "The woods"] },
    },
  );
  const scrapbook = experience(
    "Postcards from the coast",
    `<style>main{background:#e9e5d9;min-height:510px;padding:28px 30px 24px;position:relative;overflow:hidden;background-image:radial-gradient(#84735f22 .6px,transparent .6px);background-size:5px 5px}header{display:flex;justify-content:space-between;align-items:center}header span{border:1px solid #969b84;border-radius:50%;padding:10px;font:11px Georgia;transform:rotate(14deg);color:#738169}h1{font:italic 39px Georgia;margin:9px 0 22px;letter-spacing:-1px}.photos{display:flex;gap:15px;padding:2px 7px;align-items:flex-start}.polaroid{background:#fffdf7;padding:9px 9px 32px;box-shadow:0 6px 16px #372a251b;position:relative;width:56%;transform:rotate(-5deg);border-radius:1px}.polaroid.second{width:43%;transform:rotate(7deg);margin-top:35px}.polaroid:before{content:'';position:absolute;z-index:2;top:-12px;left:33%;width:62px;height:23px;background:#eee4c4bb;transform:rotate(-5deg)}img{width:100%;height:218px;object-fit:cover}.second img{height:176px}.caption{position:absolute;bottom:9px;left:14px;font:italic 13px Georgia}.bottom{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:25px}.scribble{font:italic 19px Georgia;transform:rotate(-4deg);line-height:1.3}button{background:#fff9ed;color:#584b35;border:1px solid #c6bdab;box-shadow:0 3px 0 #00000009;white-space:nowrap}#note{background:#f9edb8;padding:14px;font:italic 16px Georgia;margin-top:20px;display:none;border-radius:2px}#note.open{display:block}@media(max-width:420px){main{padding:23px 20px}h1{font-size:32px}img{height:175px}.second img{height:140px}.scribble{font-size:16px}.bottom{margin-top:22px}}</style><main><header><small>COLLECTED MOMENTS / VOL. 01</small><span>slow<br>days</span></header><h1>Postcards from the coast.</h1><div class="photos"><div class="polaroid"><img src="asset:${media.coast}" alt="A quiet coastline in the afternoon"><span class="caption">somewhere we'd stay forever</span></div><div class="polaroid second"><img src="asset:${media.lake}" alt="Water and mountains under an open sky"><span class="caption">the long way home ♡</span></div></div><div class="bottom"><p class="scribble">A little salt in the air,<br>and nowhere to be. ⤴</p><button id="open" aria-expanded="false">Open my little note ↗</button></div><p id="note">We missed the turn, found this view, and forgot what time it was. Keeping this one.</p></main><script>const button=document.getElementById('open');const note=document.getElementById('note');function show(value){note.classList.toggle('open',value);button.setAttribute('aria-expanded',String(value));button.textContent=value?'Fold the note ↙':'Open my little note ↗'}button.onclick=async()=>{const open=!note.classList.contains('open');show(open);await forma.progress.write({noteOpen:open})};forma.progress.read().then(s=>show(s.noteOpen===true));</script>`,
    {
      assets: [media.coast, media.lake],
      capabilities: ["viewer.progress.read", "viewer.progress.write"],
    },
  );
  const entries = [
    {
      owner: "ines",
      pkg: photo,
      title: "Somewhere quiet",
      caption: "Took the morning off. Found a little perspective. 🌿",
      format: "photo",
      contributors: [],
    },
    {
      owner: "maya",
      pkg: shared,
      title: "The weekend, together",
      caption: "One trip, a hundred little stories. Leave yours here.",
      format: "collaborative",
      contributors: ["you", "maya"],
    },
    {
      owner: "leo",
      pkg: story,
      title: "Take the scenic route",
      caption: "The next chapter is up to you. Lake or forest?",
      format: "story",
      contributors: [],
    },
    {
      owner: "maya",
      pkg: scrapbook,
      title: "Postcards from the coast",
      caption:
        "A weekend with no plans turned into one for the books. A few pieces of it, kept here. ☀️",
      format: "scrapbook",
      contributors: [],
    },
  ];
  for (const e of entries) {
    const a = { userId: e.owner };
    const d = service.createDraft(a, {
      package: e.pkg,
      metadata: {
        title: e.title,
        caption: e.caption,
        format: e.format,
        contributors: e.contributors,
      },
    });
    const post = service.publish(a, d.id, d.revision);
    if (e.format === "scrapbook") {
      service.comment(
        { userId: "leo" },
        post.id,
        "This feels like opening a memory. The little note 🥹",
      );
      service.toggle({ userId: "ines" }, post.id, "like");
      service.toggle({ userId: "leo" }, post.id, "like");
    }
  }
  service.createDraft(
    { userId: "you" },
    {
      package: starterPackage(),
      metadata: {
        title: "A little note",
        caption: "My first little corner of Forma.",
        format: "custom",
        contributors: [],
      },
    },
  );
  service.follow({ userId: "you" }, "maya");
  service.follow({ userId: "you" }, "leo");
  service.store.transaction(() => service.store.put("system", "seed-v1", { complete: true }));
}
