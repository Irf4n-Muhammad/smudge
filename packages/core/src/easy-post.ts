import { z } from "zod";
import type { Experience } from "../../contracts/src/experience.js";

/**
 * The easy post editor. A post is described by a small settings object (style, colours, words,
 * photos) kept in `smudge/post.js`, and the page is generated from it as ordinary files, so the
 * advanced editor, MCP and "Use format" keep working on the same package. Every string is
 * escaped; the only script is the fixed motion script below.
 */
export const postStyles = ["poster", "magazine", "gallery", "scrapbook", "note"] as const;
export type PostStyle = (typeof postStyles)[number];
export const postStyleInfo: Record<PostStyle, { name: string; note: string }> = {
  poster: { name: "Poster", note: "One big photo, one huge line" },
  magazine: { name: "Magazine", note: "A story with a cover and a drop cap" },
  gallery: { name: "Gallery", note: "Swipe through your photos" },
  scrapbook: { name: "Scrapbook", note: "Taped photos and handwritten notes" },
  note: { name: "Big note", note: "Just words, loud and clear" },
};

export const postPalettes = {
  night: { name: "Night", colors: ["#0f0f12", "#f3efe7", "#d8ff3d", "#24242a"] },
  paper: { name: "Paper", colors: ["#f4efe6", "#141210", "#ff5a1f", "#e7dfd1"] },
  lime: { name: "Lime", colors: ["#d8ff3d", "#111111", "#2b3cff", "#c6ec2c"] },
  blush: { name: "Blush", colors: ["#f7dcd8", "#2a1414", "#d6336c", "#efc4c0"] },
  ocean: { name: "Ocean", colors: ["#0d2b45", "#f4f1ea", "#ffb347", "#173a5c"] },
} as const;
export type PostPalette = keyof typeof postPalettes;

export const postFonts = {
  bold: {
    name: "Bold",
    head: '"Arial Black","Helvetica Neue",Impact,sans-serif',
    body: '"Helvetica Neue",Arial,sans-serif',
  },
  classic: {
    name: "Classic",
    head: 'Georgia,"Times New Roman",serif',
    body: 'Georgia,"Times New Roman",serif',
  },
  hand: {
    name: "Handwritten",
    head: '"Bradley Hand","Segoe Print","Comic Sans MS",cursive',
    body: '"Trebuchet MS","Helvetica Neue",sans-serif',
  },
  mono: {
    name: "Typewriter",
    head: '"Courier New",ui-monospace,Menlo,monospace',
    body: '"Courier New",ui-monospace,Menlo,monospace',
  },
} as const;
export type PostFont = keyof typeof postFonts;

export const postDesignSchema = z
  .object({
    style: z.enum(postStyles),
    palette: z.enum(Object.keys(postPalettes) as [PostPalette, ...PostPalette[]]),
    font: z.enum(Object.keys(postFonts) as [PostFont, ...PostFont[]]),
    kicker: z.string().trim().max(40),
    /** `*stars*` make words italic. */
    headline: z.string().trim().min(1).max(90),
    /** Blank lines start a new paragraph. */
    text: z.string().trim().max(1500),
    quote: z.string().trim().max(200),
    photos: z
      .array(
        z
          .object({
            /** Always an image: the photo, or a video's poster frame (so covers stay photos). */
            assetId: z.string().uuid(),
            caption: z.string().trim().max(120),
            /** Set for a video; it plays in place of the photo, which becomes its poster. */
            videoAssetId: z.string().uuid().optional(),
          })
          .strict(),
      )
      .max(12),
    motion: z.boolean(),
  })
  .strict();
export type PostDesign = z.infer<typeof postDesignSchema>;

const styleDefaults: Record<PostStyle, { palette: PostPalette; font: PostFont }> = {
  poster: { palette: "night", font: "bold" },
  magazine: { palette: "paper", font: "classic" },
  gallery: { palette: "paper", font: "bold" },
  scrapbook: { palette: "blush", font: "hand" },
  note: { palette: "lime", font: "bold" },
};
const starters: Record<PostStyle, Pick<PostDesign, "kicker" | "headline" | "text" | "quote">> = {
  poster: {
    kicker: "Tonight",
    headline: "The city *glows* after rain",
    text: "Write a few lines about this moment. What did it sound like? Who was there?",
    quote: "",
  },
  magazine: {
    kicker: "A story",
    headline: "Three things I learned *this week*",
    text: "Start with the moment everything changed.\n\nThen tell us what happened next. Short paragraphs read best on a phone.",
    quote: "Say the one line people should remember.",
  },
  gallery: {
    kicker: "Photo dump",
    headline: "Weekend, *unfiltered*",
    text: "",
    quote: "",
  },
  scrapbook: {
    kicker: "Dear diary",
    headline: "Little things from *today*",
    text: "Stick your photos down and scribble a note next to them.",
    quote: "Best part of the day!",
  },
  note: {
    kicker: "Hot take",
    headline: "Say it *louder*",
    text: "One thought, big enough to stop the scroll.",
    quote: "",
  },
};

/** A new design in a style, keeping any words and photos already written. */
export function startPostDesign(style: PostStyle, from?: Partial<PostDesign>): PostDesign {
  const words = starters[style];
  return postDesignSchema.parse({
    style,
    ...styleDefaults[style],
    kicker: from?.kicker ?? words.kicker,
    headline: from?.headline ?? words.headline,
    text: from?.text ?? words.text,
    quote: from?.quote ?? words.quote,
    photos: from?.photos ?? [],
    motion: from?.motion ?? true,
  });
}

/** Example words nobody changed come out before publishing, so they never pass for the author's. */
export function withoutStarterWords(design: PostDesign): PostDesign {
  const untouched = (key: "kicker" | "text" | "quote") =>
    Object.values(starters).some((w) => w[key] && w[key] === design[key]);
  return {
    ...design,
    ...(untouched("kicker") ? { kicker: "" } : {}),
    ...(untouched("text") ? { text: "" } : {}),
    ...(untouched("quote") ? { quote: "" } : {}),
  };
}

/** Switching style keeps the words and photos and takes that style's colours and font. */
export function restylePost(design: PostDesign, style: PostStyle): PostDesign {
  return { ...design, style, ...styleDefaults[style] };
}

const settingsFile = "smudge/post.js";
export function readPostDesign(pkg: Experience): PostDesign | null {
  if (pkg.manifest.schemaVersion !== 2) return null;
  const source = pkg.files[settingsFile];
  const match = source && /^window\.smudgePost = ([\s\S]+);\s*$/.exec(source);
  if (!match) return null;
  try {
    const parsed = postDesignSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
/** Escaped, then `*stars*` become <em>. */
const rich = (s: string) => escape(s).replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
const plain = (s: string) => s.replace(/\*([^*\n]+)\*/g, "$1");
const paragraphs = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${rich(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

/** Reveals parts as they scroll in and spells the headline in. Stays still for reduced motion. */
const motionScript = `(() => {
  const d = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  d.classList.add("moving");
  for (const el of document.querySelectorAll("[data-split]")) {
    let i = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const word of child.textContent.split(/(\\s+)/)) {
            if (!word) continue;
            if (/^\\s+$/.test(word)) { frag.append(word); continue; }
            const w = document.createElement("span");
            w.className = "w";
            for (const ch of word) {
              const c = document.createElement("span");
              c.className = "ch";
              c.style.setProperty("--i", String(i++));
              c.textContent = ch;
              w.append(c);
            }
            frag.append(w);
          }
          child.replaceWith(frag);
        } else walk(child);
      }
    };
    walk(el);
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  for (const el of document.querySelectorAll(".rv")) io.observe(el);
  requestAnimationFrame(() => d.classList.add("ready"));
})();
(() => {
  const strip = document.querySelector(".strip");
  if (!strip) return;
  const items = [...strip.children];
  const count = document.querySelector(".count b");
  const at = () => {
    let best = 0, dist = Infinity;
    const mid = strip.scrollLeft + strip.clientWidth / 2;
    items.forEach((it, i) => {
      const c = it.offsetLeft + it.offsetWidth / 2;
      if (Math.abs(c - mid) < dist) { dist = Math.abs(c - mid); best = i; }
    });
    return best;
  };
  strip.addEventListener("scroll", () => { if (count) count.textContent = String(at() + 1).padStart(2, "0"); }, { passive: true });
  for (const b of document.querySelectorAll("[data-go]")) b.addEventListener("click", () => {
    const next = items[Math.max(0, Math.min(items.length - 1, at() + Number(b.dataset.go)))];
    if (next) strip.scrollTo({ left: next.offsetLeft - (strip.clientWidth - next.offsetWidth) / 2, behavior: "smooth" });
  });
})();
`;

function baseCss(design: PostDesign) {
  const [bg, ink, accent, soft] = postPalettes[design.palette].colors;
  const font = postFonts[design.font];
  return `:root{--bg:${bg};--ink:${ink};--accent:${accent};--soft:${soft};--head:${font.head};--body:${font.body}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:18px/1.55 var(--body);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img,video{display:block;max-width:100%}
h1,h2,blockquote,figure,p{margin:0}
h1{font-family:var(--head);font-weight:${design.font === "bold" ? 900 : 400};letter-spacing:${design.font === "bold" ? "-.045em" : "-.02em"};line-height:.92;overflow-wrap:anywhere}
h1 em{font-style:italic;color:var(--accent)}
.kicker{display:inline-block;font:700 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase}
.text p+p{margin-top:1em}
.text em{font-style:italic}
figcaption{margin-top:8px;font-size:13px;opacity:.7}
.w{display:inline-block;white-space:nowrap}
.moving .ch{display:inline-block;opacity:0;transform:translateY(.5em) rotate(4deg);transition:opacity .6s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1);transition-delay:calc(var(--i)*28ms + 120ms)}
.moving.ready .ch{opacity:1;transform:none}
.moving .rv{opacity:0;transform:translateY(36px);transition:opacity .8s ease,transform 1s cubic-bezier(.2,.7,.2,1)}
.moving .rv.in{opacity:1;transform:none}
html[data-editing=on] .ch,html[data-editing=on] .rv{opacity:1!important;transform:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
}

/** `background` videos (the poster hero) loop silently behind the words; tap to pause. */
const figure = (p: PostDesign["photos"][number], i: number, cls = "", background = false) =>
  `<figure class="${`rv ${cls} ${p.videoAssetId ? "is-video" : ""}`.trim().replace(/\s+/g, " ")}" data-edit="photo-${i}">${
    p.videoAssetId
      ? `<video src="asset:${p.videoAssetId}" poster="asset:${p.assetId}" aria-label="${escape(p.caption || `Video ${i + 1}`)}" ${background ? "muted loop playsinline data-background" : "controls playsinline"} preload="metadata"></video>`
      : `<img src="asset:${p.assetId}" alt="${escape(p.caption || `Photo ${i + 1}`)}" loading="lazy">`
  }${p.caption ? `<figcaption>${escape(p.caption)}</figcaption>` : ""}</figure>`;

function render(design: PostDesign): { html: string; css: string } {
  const { photos } = design;
  const kicker = design.kicker
    ? `<span class="kicker" data-edit="kicker">${escape(design.kicker)}</span>`
    : "";
  const h1 = `<h1 data-edit="headline" data-split>${rich(design.headline)}</h1>`;
  const text = design.text
    ? `<div class="text rv" data-edit="text">${paragraphs(design.text)}</div>`
    : "";
  const quote = design.quote
    ? `<blockquote class="rv" data-edit="quote">${rich(design.quote)}</blockquote>`
    : "";
  let css = baseCss(design);
  let html = "";
  switch (design.style) {
    case "poster": {
      const [first, ...rest] = photos;
      css += `.hero{position:relative;min-height:100vh;display:grid;align-content:end;gap:18px;padding:7vw 6vw;overflow:hidden;isolation:isolate}
.hero.photo{color:#fff}.hero.plain{background:var(--accent);color:var(--bg)}
.hero.plain h1 em{color:var(--ink)}
.hero>figure{position:absolute;inset:0;z-index:-1;margin:0}
.hero>figure :is(img,video){width:100%;height:100%;object-fit:cover;animation:zoom 2.6s cubic-bezier(.2,.7,.2,1) both}
.hero>figure::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(transparent 30%,rgba(0,0,0,.7))}
.hero>figure figcaption{display:none}
.hero .kicker{justify-self:start;padding:8px 12px;background:var(--accent);color:var(--bg);transform:rotate(-3deg)}
.hero.plain .kicker{background:var(--ink);color:var(--accent)}
.hero h1{font-size:clamp(48px,12vw,170px);max-width:12ch}
.cue{position:absolute;right:6vw;top:6vw;font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.2em;text-transform:uppercase;writing-mode:vertical-rl;opacity:.8}
.body{display:grid;gap:9vh;padding:12vh 6vw}
.body .text{max-width:30em;font-size:clamp(20px,2.4vw,28px);line-height:1.45}
.body blockquote{font:400 clamp(34px,6.5vw,92px)/1 var(--head);letter-spacing:-.03em;color:var(--accent);max-width:14ch}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4vw}
.grid figure:nth-child(even){margin-top:14vh}
.grid :is(img,video){width:100%;aspect-ratio:4/5;object-fit:cover}
@keyframes zoom{from{transform:scale(1.18)}to{transform:scale(1.02)}}`;
      html = `<section class="hero ${first ? "photo" : "plain"}">${first ? figure(first, 0, "", true) : ""}<span class="cue" aria-hidden="true">Scroll ↓</span>${kicker}${h1}</section><section class="body">${text}${quote}${rest.length ? `<div class="grid">${rest.map((p, i) => figure(p, i + 1)).join("")}</div>` : ""}</section>`;
      break;
    }
    case "magazine": {
      const [first, ...rest] = photos;
      const now = new Date();
      const issue = now.toLocaleString("en", { month: "long", year: "numeric" });
      css += `main{max-width:1080px;margin:0 auto;padding:5vw 6vw 12vh}
.mast{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:12px;border-bottom:2px solid var(--ink)}
.mast small{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;opacity:.7}
main h1{margin:5vh 0 4vh;font-size:clamp(44px,8.5vw,128px)}
.cover :is(img,video){width:100%;aspect-ratio:16/10;object-fit:cover}
.cover{margin-bottom:6vh}
.text{font-size:19px;line-height:1.7}
.text>p:first-child::first-letter{float:left;margin:.08em .1em 0 0;font:400 4.6em/.8 var(--head);color:var(--accent)}
@media (min-width:760px){.text{columns:2;column-gap:48px}}
main blockquote{margin:9vh auto;max-width:18ch;text-align:center;font:italic 400 clamp(30px,5vw,64px)/1.1 var(--head)}
main blockquote::before{content:"“";display:block;color:var(--accent);font-size:2em;line-height:.6}
.more{display:grid;gap:8vh}
.more figure{width:min(100%,720px)}
.more figure:nth-child(even){margin-left:auto}
.more :is(img,video){width:100%;object-fit:cover}`;
      html = `<main><header class="mast">${kicker || "<span></span>"}<small>${escape(issue)}</small></header>${h1}${first ? figure(first, 0, "cover") : ""}${text}${quote}${rest.length ? `<div class="more">${rest.map((p, i) => figure(p, i + 1)).join("")}</div>` : ""}</main>`;
      break;
    }
    case "gallery": {
      css += `header{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:10px 24px;padding:5vh 6vw 3vh}
header h1{font-size:clamp(30px,5.5vw,72px);max-width:16ch}
.count{font:700 13px ui-monospace,Menlo,monospace;letter-spacing:.1em}
.count b{font-size:28px;color:var(--accent)}
.strip{display:flex;gap:16px;height:68vh;min-height:260px;padding:0 6vw;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.strip::-webkit-scrollbar{display:none}
.strip figure{position:relative;flex:0 0 auto;height:100%;scroll-snap-align:center}
.strip :is(img,video){height:100%;width:auto;max-width:82vw;object-fit:cover;border-radius:18px}
.strip figcaption{position:absolute;left:12px;bottom:12px;margin:0;padding:6px 10px;border-radius:99px;background:var(--bg);color:var(--ink);opacity:1;font-weight:600}
.nav{display:flex;gap:10px;padding:16px 6vw 0}
.nav button{width:48px;height:48px;border:2px solid var(--ink);border-radius:50%;background:none;color:var(--ink);font-size:20px;cursor:pointer}
.after{display:grid;gap:6vh;padding:8vh 6vw 12vh;max-width:820px}
.after .text{font-size:20px}
.after blockquote{font:400 clamp(28px,4.5vw,56px)/1.1 var(--head);color:var(--accent)}
.empty{margin:0 6vw;padding:40px;border:2px dashed var(--soft);border-radius:18px;text-align:center;opacity:.7}`;
      const n = photos.length;
      html = `<header><div>${kicker}${h1}</div>${n ? `<p class="count"><b>01</b> / ${String(n).padStart(2, "0")}</p>` : ""}</header>${
        n
          ? `<div class="strip">${photos.map((p, i) => figure(p, i)).join("")}</div>${n > 1 ? '<div class="nav"><button data-go="-1" aria-label="Previous photo">←</button><button data-go="1" aria-label="Next photo">→</button></div>' : ""}`
          : '<p class="empty" data-edit="photos">Add photos to fill your gallery.</p>'
      }<section class="after">${text}${quote}</section>`;
      break;
    }
    case "scrapbook": {
      css += `body{background-color:var(--bg);background-image:radial-gradient(var(--soft) 1.5px,transparent 1.5px);background-size:22px 22px}
main{max-width:1000px;margin:0 auto;padding:6vh 5vw 14vh}
.top{text-align:center}
.top .kicker{padding:6px 12px;border:2px solid var(--ink);border-radius:99px;transform:rotate(-2deg)}
main h1{margin:3vh auto 5vh;font-size:clamp(40px,8vw,104px);max-width:14ch;line-height:1}
main h1 em{font-style:normal;color:inherit;background:linear-gradient(transparent 58%,var(--accent) 58%,var(--accent) 88%,transparent 88%)}
.board{display:flex;flex-wrap:wrap;justify-content:center;gap:5vw 4vw}
.board figure{position:relative;width:min(44%,320px);padding:12px 12px 46px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.14);transform:rotate(var(--r))}
.board figure::before{content:"";position:absolute;top:-12px;left:50%;width:90px;height:26px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.06);transform:translateX(-50%) rotate(-4deg)}
.board :is(img,video){width:100%;aspect-ratio:1;object-fit:cover}
.board figcaption{position:absolute;left:12px;right:12px;bottom:10px;margin:0;font:20px/1.1 var(--head);color:#222;opacity:1;text-align:center}
.moving .board figure.rv{transform:translateY(40px) rotate(0)}
.moving .board figure.rv.in{transform:rotate(var(--r))}
.notes{display:flex;flex-wrap:wrap;justify-content:center;gap:5vw;margin-top:8vh}
.notes .text{width:min(100%,460px);padding:28px 30px;background:#fffdf6 repeating-linear-gradient(transparent 0 31px,rgba(43,60,255,.18) 31px 32px);color:#2a2622;font-size:18px;line-height:32px;box-shadow:0 8px 24px rgba(0,0,0,.1);transform:rotate(-1deg)}
.notes blockquote{align-self:start;width:min(100%,260px);padding:26px;background:var(--accent);color:#fff;font:26px/1.15 var(--head);box-shadow:0 8px 24px rgba(0,0,0,.14);transform:rotate(3deg)}`;
      const tilts = ["-4deg", "3deg", "-2deg", "5deg", "-5deg", "2deg"];
      html = `<main><div class="top">${kicker}${h1}</div>${
        photos.length
          ? `<div class="board">${photos.map((p, i) => figure(p, i).replace("<figure ", `<figure style="--r:${tilts[i % tilts.length]}" `)).join("")}</div>`
          : ""
      }<div class="notes">${text}${quote}</div></main>`;
      break;
    }
    case "note": {
      const band = escape(plain(design.kicker || design.headline));
      css += `.hero{min-height:100vh;display:grid;align-content:center;gap:3vh;padding:8vw 6vw}
.hero h1{font-size:clamp(56px,13vw,210px);line-height:.86;max-width:10ch}
.hero h1 em{color:var(--accent);-webkit-text-stroke:0}
.band{overflow:hidden;padding:14px 0;background:var(--ink);color:var(--bg);font:900 clamp(22px,3.4vw,40px)/1 var(--head);white-space:nowrap}
.band span{display:inline-block;padding-right:2em}
.moving .band div{display:inline-block;animation:slide 18s linear infinite}
@keyframes slide{to{transform:translateX(-50%)}}
.rest{display:grid;gap:8vh;padding:10vh 6vw 14vh;max-width:900px}
.rest .text{font-size:clamp(22px,3vw,34px);line-height:1.35;font-weight:500}
.rest blockquote{padding-left:24px;border-left:8px solid var(--accent);font:400 clamp(28px,4vw,52px)/1.1 var(--head)}
.rest .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.rest .grid :is(img,video){width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}`;
      const lane = `<span>${band} ✺</span>`.repeat(6);
      html = `<section class="hero">${kicker}${h1}</section><div class="band" aria-hidden="true"><div>${lane}${lane}</div></div><section class="rest">${text}${quote}${photos.length ? `<div class="grid">${photos.map((p, i) => figure(p, i)).join("")}</div>` : ""}</section>`;
      break;
    }
  }
  return { html, css };
}

/** Background videos play muted unless the viewer asked for less motion; a tap pauses or plays. */
const videoScript = `for(const v of document.querySelectorAll("video[data-background]")){v.muted=true;if(!matchMedia("(prefers-reduced-motion: reduce)").matches)v.play().catch(()=>{});v.closest("section,figure").addEventListener("click",()=>v.paused?v.play().catch(()=>{}):v.pause())}`;

/** The post package and metadata for a design. Metadata the editor owns (caption, button) is kept. */
export function buildPost(input: unknown) {
  const design = postDesignSchema.parse(input);
  const assets = [
    ...new Set(
      design.photos.flatMap((p) => [p.assetId, ...(p.videoAssetId ? [p.videoAssetId] : [])]),
    ),
  ];
  const { html, css } = render(design);
  const background = html.includes("data-background");
  const data = JSON.stringify(design).replace(/</g, "\\u003c");
  const pkg: Experience = {
    manifest: {
      schemaVersion: 2,
      runtimeVersion: "web-v1",
      name: plain(design.headline).slice(0, 100),
      entrypoint: "index.html",
      capabilities: [],
      assets,
    },
    files: {
      "index.html": `<link rel="stylesheet" href="post.css"><script src="smudge/post.js"></script>${html}${design.motion ? '<script src="motion.js"></script>' : ""}${background ? '<script src="video.js"></script>' : ""}`,
      "post.css": css,
      [settingsFile]: `window.smudgePost = ${data};\n`,
      ...(design.motion ? { "motion.js": motionScript } : {}),
      ...(background ? { "video.js": videoScript } : {}),
    },
  };
  return {
    package: pkg,
    metadata: {
      title: plain(design.headline).slice(0, 100),
      format: (design.style === "scrapbook"
        ? "scrapbook"
        : design.style === "gallery"
          ? "photo"
          : "custom") as "scrapbook" | "photo" | "custom",
      ...(design.photos[0] ? { coverAssetId: design.photos[0].assetId } : {}),
    },
  };
}
