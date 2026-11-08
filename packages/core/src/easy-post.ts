import { z } from "zod";
import type { Experience } from "../../contracts/src/experience.js";
import { fillSource } from "./fill-script.js";

/**
 * The easy post editor. A post is described by a small settings object (style, colours, words,
 * photos) kept in `smudge/post.js`, and the page is generated from it as ordinary files, so the
 * advanced editor, MCP and "Use format" keep working on the same package. Every string is
 * escaped; the only script is the fixed motion script below.
 */
export const postStyles = [
  "poster",
  "magazine",
  "gallery",
  "scrapbook",
  "note",
  "plan",
  "ask",
] as const;
export type PostStyle = (typeof postStyles)[number];
export const postStyleInfo: Record<PostStyle, { name: string; note: string }> = {
  poster: { name: "Poster", note: "One big photo, one huge line" },
  magazine: { name: "Magazine", note: "A story with a cover and a drop cap" },
  gallery: { name: "Gallery", note: "Swipe through your photos" },
  scrapbook: { name: "Scrapbook", note: "Taped photos and handwritten notes" },
  note: { name: "Big note", note: "Just words, loud and clear" },
  plan: { name: "Plan", note: "Invite people and see who's in" },
  ask: { name: "Ask", note: "A photo and one question for your friends" },
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
    /**
     * The parts anyone may change in their own version ("Post my version"). Written out as
     * `smudge/fill.js`, so the post works as a fill-in format without any code.
     */
    fill: z
      .array(z.enum(["kicker", "headline", "text", "quote", "photo"]))
      .max(5)
      .optional(),
    /** The Ask style: how friends answer the headline's question. */
    ask: z
      .object({
        /** Tap one option, write a few words, or slide. */
        kind: z.enum(["poll", "open", "slider"]),
        options: z.array(z.string().trim().min(1).max(40)).max(4),
        emoji: z.string().trim().min(1).max(8).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.style === "ask" && d.ask?.kind === "poll" && d.ask.options.length < 2)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ASK_NEEDS_TWO_OPTIONS" });
  });
export type PostDesign = z.infer<typeof postDesignSchema>;

const styleDefaults: Record<PostStyle, { palette: PostPalette; font: PostFont }> = {
  poster: { palette: "night", font: "bold" },
  magazine: { palette: "paper", font: "classic" },
  gallery: { palette: "paper", font: "bold" },
  scrapbook: { palette: "blush", font: "hand" },
  note: { palette: "lime", font: "bold" },
  plan: { palette: "ocean", font: "bold" },
  ask: { palette: "night", font: "bold" },
};
export type PostAsk = NonNullable<PostDesign["ask"]>;
export const fillParts = ["kicker", "headline", "text", "quote", "photo"] as const;
export type FillPart = (typeof fillParts)[number];
const firstAsk = (): PostAsk => ({ kind: "poll", options: ["Yes, do it", "Don't"] });
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
  plan: {
    kicker: "Sunday 05:30 · GBK",
    headline: "Long run, *who's in?*",
    text: "Easy pace, 21K, coffee after. Say where and when up top; people tap I'm in and their names show up here.",
    quote: "",
  },
  ask: {
    kicker: "",
    headline: "Should I *cut my hair*?",
    text: "",
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
    ...(from?.fill ? { fill: from.fill } : {}),
    ...(style === "ask" || from?.ask ? { ask: from?.ask ?? firstAsk() } : {}),
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
  return {
    ...design,
    style,
    ...styleDefaults[style],
    ...(style === "ask" && !design.ask ? { ask: firstAsk() } : {}),
  };
}

const settingsFile = "smudge/post.js";
export function readPostDesign(pkg: Experience): PostDesign | null {
  if (pkg.manifest.schemaVersion !== 2) return null;
  const source = pkg.files[settingsFile];
  const match = source && /^window\.smudgePost = ([\s\S]+);\s*$/.exec(source);
  if (!match) return null;
  try {
    const parsed = postDesignSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? withFilled(parsed.data, pkg) : null;
  } catch {
    return null;
  }
}

/**
 * Someone's own version of a fillable post keeps the maker's settings and only rewrites
 * `smudge/fill.js`, so the editor reads the words and photo from there: opening your version
 * shows what you wrote, not what the maker did.
 */
function withFilled(design: PostDesign, pkg: Experience): PostDesign {
  if (!design.fill?.length) return design;
  const match = /^window\.smudgeFill = (.+);\s*(?:\n|$)/.exec(pkg.files["smudge/fill.js"] ?? "");
  if (!match) return design;
  let fields: { key?: unknown; value?: unknown }[];
  try {
    fields = (JSON.parse(match[1]!) as { fields: { key?: unknown; value?: unknown }[] }).fields;
  } catch {
    return design;
  }
  const next = { ...design, photos: [...design.photos] };
  for (const f of Array.isArray(fields) ? fields : []) {
    if (typeof f.value !== "string") continue;
    const value = f.value;
    if (f.key === "kicker") next.kicker = value.trim().slice(0, 40);
    else if (f.key === "headline" && value.trim()) next.headline = value.trim().slice(0, 90);
    else if (f.key === "text") next.text = value.trim().slice(0, 1500);
    else if (f.key === "quote") next.quote = value.trim().slice(0, 200);
    else if (f.key === "photo" && next.photos[0]) {
      const id = /^asset:([a-f0-9-]{36})$/.exec(value)?.[1];
      if (id) next.photos[0] = { ...next.photos[0], assetId: id };
    }
  }
  const parsed = postDesignSchema.safeParse(next);
  return parsed.success ? parsed.data : design;
}

const fillLabels: Record<FillPart, string> = {
  kicker: "Small label",
  headline: "Headline",
  text: "Your words",
  quote: "Big quote",
  photo: "Photo",
};
/**
 * The parts of a design that can be offered for others to change: only those the post shows, and
 * the cover only when it is a photo (a version can't swap in a video).
 */
export function fillableParts(design: PostDesign): FillPart[] {
  return fillParts.filter((k) =>
    k === "photo"
      ? !!design.photos[0] && !design.photos[0].videoAssetId
      : k === "headline" || !!design[k],
  );
}
function fillFields(design: PostDesign) {
  const offered = new Set(fillableParts(design));
  return fillParts
    .filter((k) => design.fill?.includes(k) && offered.has(k))
    .map((k) => ({
      key: k,
      label:
        k === "headline" && design.style === "ask"
          ? "The question"
          : k === "kicker" && design.style === "plan"
            ? "When and where"
            : fillLabels[k],
      kind: k === "photo" ? "image" : k === "text" ? "long" : "text",
      value: k === "photo" ? `asset:${design.photos[0]!.assetId}` : design[k],
    }));
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
/**
 * Escaped, then `*stars*` become <em>. Punctuation right after the stars stays on the line of the
 * last italic word ("*breakfast*?" never leaves the "?" alone on a line).
 */
const rich = (s: string) =>
  escape(s)
    .replace(
      /\*([^*\n]*?)([^*\s]+)\*([^\s*]+)/g,
      (_all, lead: string, last: string, tail: string) =>
        `${lead ? `<em>${lead}</em>` : ""}<span class="nb"><em>${last}</em>${tail}</span>`,
    )
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
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
.nb{white-space:nowrap}
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
  const fills = new Set(fillFields(design).map((f) => f.key));
  const mark = (k: FillPart, rich = "") =>
    fills.has(k)
      ? ` data-fill="${k}"${rich ? ` data-fill-rich${rich === "long" ? '="long"' : ""}` : ""}`
      : "";
  const kicker = design.kicker
    ? `<span class="kicker" data-edit="kicker"${mark("kicker")}>${escape(design.kicker)}</span>`
    : "";
  const h1 = `<h1 data-edit="headline" data-split${mark("headline", "line")}>${rich(design.headline)}</h1>`;
  const text = design.text
    ? `<div class="text rv" data-edit="text"${mark("text", "long")}>${paragraphs(design.text)}</div>`
    : "";
  const quote = design.quote
    ? `<blockquote class="rv" data-edit="quote"${mark("quote", "line")}>${rich(design.quote)}</blockquote>`
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
      const bandKey: FillPart = design.kicker ? "kicker" : "headline";
      const band = `<i${mark(bandKey, "line")}>${escape(plain(design.kicker || design.headline))}</i>`;
      css += `.hero{min-height:100vh;display:grid;align-content:center;gap:3vh;padding:8vw 6vw}
.hero h1{font-size:clamp(56px,13vw,210px);line-height:.86;max-width:10ch}
.hero h1 em{color:var(--accent);-webkit-text-stroke:0}
.band{overflow:hidden;padding:14px 0;background:var(--ink);color:var(--bg);font:900 clamp(22px,3.4vw,40px)/1 var(--head);white-space:nowrap}
.band span{display:inline-block;padding-right:2em}.band i,.band em{font-style:normal}
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
    case "plan": {
      // The box with the button comes right under the call, so it is in view inside a feed card
      // on a phone; the details and photos follow for whoever opens the post.
      css += `.hero{display:grid;gap:14px;padding:6vw 5vw 2vw}
.hero h1{font-size:clamp(36px,9vw,110px);max-width:12ch}
.hero .kicker{justify-self:start;padding:8px 12px;border:2px solid var(--accent);color:var(--accent);border-radius:999px;text-transform:none;letter-spacing:.04em;font-size:13px}
.plan{margin:3vw 5vw;padding:18px;border-radius:22px;background:var(--soft);display:grid;gap:12px}
.plan .join{justify-self:start;border:0;border-radius:999px;padding:14px 26px;background:var(--accent);color:var(--bg);font:900 17px var(--head);cursor:pointer;transition:transform .15s}
.plan .join:active{transform:scale(.97)}.plan .join.on{background:var(--ink);color:var(--bg)}
.plan .join[disabled]{opacity:.6;cursor:default}
.plan .buttons{display:flex;flex-wrap:wrap;gap:8px}
.plan .came{border:2px solid var(--accent);border-radius:999px;padding:12px 20px;background:transparent;color:var(--accent);font:800 15px var(--head);cursor:pointer}
.plan .came.on{background:var(--accent);color:var(--bg)}.plan .came[hidden]{display:none}
.plan .came-count{margin-left:10px;opacity:.75;font-weight:600}
.plan .face.there{box-shadow:0 0 0 2px var(--accent)}
.plan .going{font:700 14px var(--body)}.plan .going b{font:900 26px/1 var(--head);margin-right:6px}
.plan .faces{display:flex;flex-wrap:wrap;gap:6px;min-height:34px}
.plan .face{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#1b1b1f;font:700 12px var(--body);border:2px solid var(--bg)}
.plan .names{font-size:14px;opacity:.85;line-height:1.4}
.rest{display:grid;gap:18px;padding:2vw 5vw 10vh;max-width:720px}
.rest .text{font-size:clamp(17px,2.2vw,21px);opacity:.92}
.rest figure :is(img,video){width:100%;border-radius:18px}`;
      html = `<section class="hero">${kicker}${h1}</section><section class="plan rv" data-plan aria-label="Who's in"><div class="buttons"><button class="join" type="button" data-plan-join>I'm in</button><button class="came" type="button" data-plan-came hidden>I was there</button></div><p class="going"><b data-plan-count>0</b><span data-plan-label>people in</span><span class="came-count" data-plan-came-label></span></p><div class="faces" data-plan-faces></div><p class="names" data-plan-names>Tap the button and your name shows up here.</p></section><section class="rest">${text}${quote}${photos.map((p, i) => figure(p, i)).join("")}</section>`;
      break;
    }
    case "ask": {
      // Sized for a feed card (460px tall): the photo takes what the answer box leaves, so the
      // question and the buttons are both in view without opening the post.
      const [first] = photos;
      const ask = design.ask ?? firstAsk();
      css += `body{min-height:100vh;display:flex;flex-direction:column}
.ask{position:relative;flex:1 1 auto;display:grid;align-content:end;gap:10px;min-height:190px;padding:22px 20px 40px;overflow:hidden;isolation:isolate}
.ask.photo{color:#fff}.ask.plain{background:var(--accent);color:var(--bg)}.ask.plain h1 em{color:var(--ink)}
.ask>figure{position:absolute;inset:0;z-index:-1}
.ask>figure :is(img,video){width:100%;height:100%;object-fit:cover}
.ask>figure::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 35%,rgba(0,0,0,.72))}
.ask>figure figcaption{display:none}
.ask .kicker{justify-self:start;padding:7px 11px;border-radius:99px;background:var(--accent);color:var(--bg)}
.ask h1{font-size:clamp(30px,8.4vw,76px);line-height:.95;max-width:18ch}
.answer{position:relative;z-index:1;display:grid;gap:10px;margin-top:-22px;padding:16px 16px 14px;border-radius:22px 22px 0 0;background:var(--bg);color:var(--ink)}
.answer .opts{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:8px}
.answer .opts.many{grid-template-columns:1fr 1fr}
.answer .opt{position:relative;overflow:hidden;min-height:52px;border:2px solid var(--soft);border-radius:16px;padding:10px 12px;background:var(--soft);color:var(--ink);font:800 15px/1.2 var(--body);cursor:pointer;text-align:left}
.answer .opt .bar{position:absolute;inset:0 auto 0 0;width:0;background:var(--accent);opacity:.32;transition:width .6s cubic-bezier(.2,.7,.2,1)}
.answer .opt span,.answer .opt b{position:relative}
.answer .opt b{float:right;margin-left:8px;font-weight:900;opacity:0;transition:opacity .3s}
.answer.done .opt{cursor:default}.answer.done .opt b{opacity:1}
.answer .opt.mine{border-color:var(--accent)}
.answer form{display:flex;gap:8px}
.answer input[type=text]{flex:1;min-width:0;border:2px solid var(--soft);border-radius:14px;padding:12px 14px;background:var(--soft);color:var(--ink);font:600 16px var(--body)}
.answer .send{border:0;border-radius:14px;padding:0 18px;background:var(--accent);color:var(--bg);font:900 15px var(--body);cursor:pointer}
.answer .said{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.answer .said li{padding:7px 11px;border-radius:14px;background:var(--soft);font:600 14px/1.3 var(--body)}
.answer .said li b{margin-right:6px}
.answer .said li.mine{background:var(--accent);color:var(--bg)}
.answer .slide{display:grid;gap:6px}
.answer .face{font-size:34px;line-height:1;text-align:center;transition:transform .15s}
.answer input[type=range]{width:100%;height:34px;accent-color:var(--accent);cursor:pointer}
.answer .marks{position:relative;height:22px}
.answer .marks i{position:absolute;top:0;transform:translateX(-50%);min-width:22px;height:22px;padding:0 5px;border-radius:99px;background:var(--soft);color:var(--ink);font:700 11px/22px var(--body);font-style:normal;text-align:center}
.answer .marks i.mine{background:var(--accent);color:var(--bg)}
.answer .who{margin:0;font:600 13px/1.35 var(--body);opacity:.75}
.answer .again{justify-self:start;border:0;padding:0;background:none;color:inherit;font:700 13px var(--body);text-decoration:underline;cursor:pointer;opacity:.75}
.answer [hidden]{display:none!important}
.after{display:grid;gap:18px;padding:22px 20px 40px;max-width:720px}
.after .text{font-size:18px}`;
      const opts =
        ask.kind === "poll"
          ? `<div class="opts${ask.options.length > 2 ? " many" : ""}" style="--n:${Math.min(2, ask.options.length)}">${ask.options.map((o, i) => `<button class="opt" type="button" data-ask-option="${i}"><i class="bar"></i><b></b><span>${escape(o)}</span></button>`).join("")}</div>`
          : ask.kind === "open"
            ? `<form data-ask-form><input type="text" maxlength="80" placeholder="Your answer" aria-label="Your answer"><button class="send" type="submit">Send</button></form><ul class="said" data-ask-said hidden></ul>`
            : `<div class="slide"><div class="face" aria-hidden="true" data-ask-face>${escape(ask.emoji ?? "😍")}</div><input type="range" min="0" max="100" value="50" aria-label="Slide to answer" data-ask-range><div class="marks" data-ask-marks></div></div>`;
      html = `<section class="ask ${first ? "photo" : "plain"}">${first ? figure(first, 0, "", true) : ""}${kicker}${h1}</section><section class="answer" data-ask data-edit="ask" aria-label="Answer">${opts}<p class="who" data-ask-who></p><button class="again" type="button" data-ask-again hidden>Change my answer</button></section>${text || quote ? `<section class="after">${text}${quote}</section>` : ""}`;
      break;
    }
  }
  // The cover photo is the one a version can swap.
  if (fills.has("photo")) {
    const cover = `<img src="asset:${photos[0]!.assetId}"`;
    html = html.replace(cover, `${cover} data-fill="photo"`);
  }
  return { html, css };
}

/**
 * The plan box asks the host who is in and toggles the viewer with one tap. Outside Smudge (a
 * saved copy, a guest page) `forma` is missing or refuses, and the box says so instead of lying.
 */
const planScript = `(() => {
  const box = document.querySelector("[data-plan]");
  if (!box) return;
  const btn = box.querySelector("[data-plan-join]"), count = box.querySelector("[data-plan-count]"),
    label = box.querySelector("[data-plan-label]"), faces = box.querySelector("[data-plan-faces]"),
    names = box.querySelector("[data-plan-names]"), cameBtn = box.querySelector("[data-plan-came]"),
    cameLabel = box.querySelector("[data-plan-came-label]");
  let going = false, came = false, busy = false;
  const show = (v) => {
    going = !!v.going; came = !!v.came;
    count.textContent = String(v.count);
    label.textContent = v.count === 1 ? "person in" : "people in";
    btn.textContent = going ? "I'm out" : "I'm in";
    btn.classList.toggle("on", going);
    // Once you are in, the plan can also keep who actually came: the record a chat never keeps.
    cameBtn.hidden = !going;
    cameBtn.textContent = came ? "I was there ✓" : "I was there";
    cameBtn.classList.toggle("on", came);
    cameLabel.textContent = v.cameCount ? "· " + v.cameCount + " came" : "";
    faces.replaceChildren(...v.people.slice(0, 12).map((p) => {
      const s = document.createElement("span");
      s.className = p.came ? "face there" : "face"; s.style.background = p.color;
      s.title = p.came ? p.name + " · was there" : p.name; s.textContent = p.initials;
      return s;
    }));
    const list = v.people.map((p) => p.name);
    const extra = v.count - list.length;
    names.textContent = !v.count ? "Nobody yet. Be the first." :
      (list.length > 3 ? list.slice(0, 3).join(", ") + " and " + (list.length - 3 + extra) + " more" :
      list.length ? list.join(", ") + (extra > 0 ? " and " + extra + " more" : "") : extra + " in") + (going ? " · you're in" : "");
  };
  const fail = (e) => {
    names.textContent = /RUNTIME|GUEST|NOT_FOUND|sign/i.test(String(e && e.message)) ? "Open this in Smudge to join." : "Could not reach Smudge. Try again.";
  };
  if (!window.forma || !window.forma.plan) { btn.disabled = true; names.textContent = "Open this in Smudge to join."; return; }
  window.forma.plan.read().then(show).catch(fail);
  const act = (call) => {
    if (busy || document.documentElement.dataset.editing === "on") return;
    busy = true; btn.disabled = true; cameBtn.disabled = true;
    call().then(show).catch(fail).finally(() => { busy = false; btn.disabled = false; cameBtn.disabled = false; });
  };
  btn.addEventListener("click", () => act(() => window.forma.plan.join(!going)));
  cameBtn.addEventListener("click", () => act(() => window.forma.plan.came(!came)));
})();
`;

/**
 * The Ask box: one answer per person through `answers.write`, then what you and the people you
 * follow said. Everyone else counts in the number only, the way answers work everywhere.
 */
const askScript = `(() => {
  const box = document.querySelector("[data-ask]");
  if (!box) return;
  const ask = (window.smudgePost && window.smudgePost.ask) || { kind: "poll", options: [] };
  const who = box.querySelector("[data-ask-who]"), again = box.querySelector("[data-ask-again]");
  let state = null, busy = false, changing = false;
  const editing = () => document.documentElement.dataset.editing === "on";
  const first = (n) => String(n || "").split(" ")[0];
  const people = () => state ? [...(state.mine ? [Object.assign({}, state.mine, { you: true })] : []), ...state.friends.filter((f) => !state.mine || f.userId !== state.mine.userId)] : [];
  const line = () => {
    const total = state ? Math.max(state.count || 0, state.mine ? 1 : 0) : 0;
    if (!total) { who.textContent = ask.kind === "poll" ? "Tap one. Your friends see what you picked." : "Be the first to answer."; return; }
    const names = state.friends.filter((f) => !state.mine || f.userId !== state.mine.userId).slice(0, 2).map((f) => first(f.name));
    const known = (state.mine ? 1 : 0) + names.length;
    const rest = total - known;
    const bits = (state.mine ? ["You"] : []).concat(names);
    if (rest > 0) bits.push(rest + (bits.length ? " more" : rest === 1 ? " person" : " people"));
    who.textContent = bits.join(", ").replace(/, ([^,]*)$/, " and $1") + " answered";
  };
  const fail = (e) => { who.textContent = /RUNTIME|GUEST|NOT_FOUND|sign/i.test(String(e && e.message)) ? "Open this in Smudge to answer." : "Could not reach Smudge. Try again."; };
  const answered = () => !!(state && state.mine) && !changing;
  const show = () => {
    const done = answered();
    box.classList.toggle("done", done);
    again.hidden = !done;
    if (ask.kind === "poll") {
      const opts = [...box.querySelectorAll("[data-ask-option]")];
      const votes = opts.map(() => 0);
      for (const p of people()) { const i = ask.options.indexOf(p.pick); if (i >= 0) votes[i]++; }
      const all = Math.max(1, votes.reduce((a, b) => a + b, 0));
      opts.forEach((o, i) => {
        const pct = Math.round((votes[i] / all) * 100);
        o.querySelector(".bar").style.width = done ? pct + "%" : "0";
        o.querySelector("b").textContent = done ? pct + "%" : "";
        o.classList.toggle("mine", done && state.mine.pick === ask.options[i]);
      });
    } else if (ask.kind === "open") {
      const form = box.querySelector("[data-ask-form]"), said = box.querySelector("[data-ask-said]");
      form.hidden = done;
      const list = people().filter((p) => p.pick);
      said.hidden = !done || !list.length;
      said.replaceChildren(...list.slice(0, 8).map((p) => {
        const li = document.createElement("li"), b = document.createElement("b");
        if (p.you) li.className = "mine";
        b.textContent = p.you ? "You" : first(p.name);
        li.append(b, p.pick);
        return li;
      }));
    } else {
      const range = box.querySelector("[data-ask-range]"), marks = box.querySelector("[data-ask-marks]");
      if (done) range.value = String(state.mine.score);
      range.disabled = done;
      const list = done ? people().filter((p) => typeof p.score === "number") : [];
      // Close answers stack, so a name never hides behind another one.
      const rows = [[], [], []];
      marks.replaceChildren(...list.slice(0, 10).map((p) => {
        const i = document.createElement("i");
        if (p.you) i.className = "mine";
        const at = Math.max(4, Math.min(96, p.score));
        const row = Math.max(0, rows.findIndex((r) => r.every((x) => Math.abs(x - at) > 14)));
        rows[row].push(at);
        i.style.left = at + "%";
        i.style.top = row * 26 + "px";
        i.textContent = p.you ? "You" : first(p.name).slice(0, 6);
        i.title = (p.you ? "You" : p.name) + ": " + p.score;
        return i;
      }));
      marks.style.height = (rows.filter((r) => r.length).length || 1) * 26 + "px";
    }
    line();
  };
  const send = (answer) => {
    if (busy || editing()) return;
    busy = true;
    window.forma.answers.set(answer).then((r) => { state = r; changing = false; show(); }).catch(fail).finally(() => { busy = false; });
  };
  if (!window.forma || !window.forma.answers) { box.querySelectorAll("button,input").forEach((b) => (b.disabled = true)); who.textContent = "Open this in Smudge to answer."; return; }
  window.forma.answers.read().then((r) => { state = r; show(); }).catch((e) => { show(); fail(e); });
  again.addEventListener("click", () => { if (editing()) return; changing = true; show(); });
  if (ask.kind === "poll") {
    for (const o of box.querySelectorAll("[data-ask-option]")) o.addEventListener("click", () => { if (!answered()) send({ pick: ask.options[Number(o.dataset.askOption)] }); });
  } else if (ask.kind === "open") {
    const form = box.querySelector("[data-ask-form]"), input = form.querySelector("input");
    form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (v) send({ pick: v.slice(0, 80) }); });
  } else {
    const range = box.querySelector("[data-ask-range]"), face = box.querySelector("[data-ask-face]");
    range.addEventListener("input", () => { face.style.transform = "scale(" + (0.8 + Number(range.value) / 100) + ")"; });
    // Keys move the slider one step at a time: wait until it settles before answering.
    let settle;
    range.addEventListener("change", () => { clearTimeout(settle); settle = setTimeout(() => send({ score: Number(range.value), of: 100 }), 600); });
  }
})();
`;

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
  const plan = design.style === "plan";
  const ask = design.style === "ask";
  const fields = fillFields(design);
  const data = JSON.stringify(design).replace(/</g, "\\u003c");
  const pkg: Experience = {
    manifest: {
      schemaVersion: 2,
      runtimeVersion: "web-v1",
      name: plain(design.headline).slice(0, 100),
      entrypoint: "index.html",
      capabilities: plan
        ? ["plan.read", "plan.join"]
        : ask
          ? ["answers.write", "answers.read"]
          : [],
      assets,
    },
    files: {
      "index.html": `<link rel="stylesheet" href="post.css"><script src="smudge/post.js"></script>${html}${fields.length ? '<script src="smudge/fill.js"></script>' : ""}${design.motion ? '<script src="motion.js"></script>' : ""}${background ? '<script src="video.js"></script>' : ""}${plan ? '<script src="plan.js"></script>' : ""}${ask ? '<script src="ask.js"></script>' : ""}`,
      "post.css": css,
      [settingsFile]: `window.smudgePost = ${data};\n`,
      ...(design.motion ? { "motion.js": motionScript } : {}),
      ...(background ? { "video.js": videoScript } : {}),
      ...(plan ? { "plan.js": planScript } : {}),
      ...(ask ? { "ask.js": askScript } : {}),
      ...(fields.length ? { "smudge/fill.js": fillSource(fields) } : {}),
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
