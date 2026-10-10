import { z } from "zod";
import {
  partSlots,
  profilePackageSchema,
  type ProfilePackage,
} from "../../contracts/src/profile.js";

export const profileDesignSchema = z
  .object({
    illustrationX: z.number().int().min(-100).max(100),
    illustrationY: z.number().int().min(-80).max(80),
    illustrationScale: z.number().int().min(50).max(150),
    illustrationVisible: z.boolean(),
    illustrationAssetId: z.string().uuid().nullable(),
    portraitSize: z.number().int().min(80).max(200),
    alignment: z.enum(["left", "center"]),
    columns: z.number().int().min(1).max(3),
    gap: z.number().int().min(8).max(40),
    card: z.enum(["cutout", "straight", "round"]),
    story: z.enum(["circles", "tiles"]),
    storyOrder: z.enum(["original", "reverse"]).default("original"),
    order: z
      .array(z.enum(partSlots))
      .length(4)
      .refine((v) => new Set(v).size === 4, "Use each surface once"),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
export type ProfileDesign = z.infer<typeof profileDesignSchema>;
export const defaultProfileDesign: ProfileDesign = {
  illustrationX: 0,
  illustrationY: 0,
  illustrationScale: 100,
  illustrationVisible: true,
  illustrationAssetId: null,
  portraitSize: 140,
  alignment: "left",
  columns: 2,
  gap: 20,
  card: "cutout",
  story: "circles",
  storyOrder: "original",
  order: ["profile", "story", "feature", "post"],
  accent: "#e93122",
};
const designFile = "personal/design.js";
export function supportsProfileDesign(pkg: ProfilePackage) {
  return (
    pkg.manifest.schemaVersion === 2 &&
    ["raka/profile.html", "basic/profile.html"].includes(
      pkg.manifest.parts.profile?.entrypoint ?? "",
    ) &&
    Boolean(pkg.files["raka/profile.html"]) &&
    pkg.files["index.html"]?.includes('<main class="world">') &&
    partSlots.every((s) => pkg.files["index.html"]?.includes(`<!--forma:${s}-->`))
  );
}
export function readProfileDesign(pkg: ProfilePackage): ProfileDesign | null {
  const source = pkg.files[designFile];
  if (!source) return null;
  try {
    const match = /^window\.formaDesign = (.+);\s*$/.exec(source);
    return match ? profileDesignSchema.parse(JSON.parse(match[1]!)) : null;
  } catch {
    return null;
  }
}
/** Visual authoring writes ordinary source, preserving custom code and capability grants. */
export function applyProfileDesign(input: ProfilePackage, settings: unknown): ProfilePackage {
  const pkg = structuredClone(profilePackageSchema.parse(input));
  const d = profileDesignSchema.parse(settings);
  if (!supportsProfileDesign(pkg))
    throw new Error("This package has no visual composition controls. Use its source editor.");
  pkg.files[designFile] = `window.formaDesign = ${JSON.stringify(d)};`;
  if (d.illustrationAssetId && !pkg.manifest.assets.includes(d.illustrationAssetId))
    pkg.manifest.assets.push(d.illustrationAssetId);
  let i = 0;
  let shell = pkg.files["index.html"]!.replace(
    /<!--forma:(profile|post|story|feature)-->/g,
    () => `<!--forma:${d.order[i++]}-->`,
  );
  if (!shell.includes('src="personal/design.js"'))
    shell = '<script src="personal/design.js"></script>\n' + shell;
  if (!shell.includes('src="personal/boot.js"'))
    shell = '<script src="personal/boot.js"></script>\n' + shell;
  if (!shell.includes('href="personal/design.css"'))
    shell = shell.replace(
      '<main class="world">',
      '<link rel="stylesheet" href="personal/design.css" />\n<main class="world">',
    );
  pkg.files["index.html"] = shell;
  // Runs after the original fragments. This also upgrades old Raka copies without rewriting them.
  pkg.files["personal/boot.js"] = `
document.addEventListener("DOMContentLoaded", () => {
  if (!window.profileData) return;
  window.profileData.then((d) => {
    const world = document.querySelector(".world");
    world.classList.remove("is-raka"); world.classList.add("is-personal");
    const target = document.querySelector(".identity, .basic-header h1");
    if (target) {
      const avatar = document.createElement("div"); avatar.className = "personal-avatar";
      if (d.owner.avatarSrc) {
        const img = document.createElement("img"); img.src = d.owner.avatarSrc;
        img.alt = d.owner.name + " avatar"; avatar.append(img);
      } else avatar.textContent = d.owner.initials;
      target.before(avatar);
    }
    const name = document.getElementById("owner-name");
    if(name) { name.setAttribute("role", "heading"); name.setAttribute("aria-level", "1"); }
    const highlights = document.querySelector(".stories-comic");
    if (highlights) {
      const photos = d.posts.filter(p => p.format !== "story");
      const stories = d.posts.filter(p => p.format === "story");
      const posts = [photos[0], stories[0], photos[1]].filter(Boolean);
      highlights.querySelectorAll(".story").forEach((button, index) => {
        const post = posts[index];
        if (!post) return;
        const art = button.querySelector(".story-icon");
        art.replaceChildren(); art.textContent = post.title.slice(0, 2).toUpperCase();
        button.lastElementChild.textContent = post.title;
        button.setAttribute("aria-label", "Open highlight " + post.title);
        if (post.hasCover && ${pkg.manifest.schemaVersion === 2 && pkg.manifest.capabilities.includes("profile.cover")}) {
          forma.profile.cover(post.id).then(cover => {
            if (!cover) return;
            const img = document.createElement("img"); img.src = cover.src; img.alt = "";
            art.replaceChildren(img);
          }).catch(() => {});
        }
      });
      if (window.formaDesign.storyOrder === "reverse")
        Array.from(highlights.children).reverse().forEach(child => highlights.append(child));
    }
  });
});`;
  if (pkg.manifest.schemaVersion === 2) {
    pkg.manifest.autoHeight = true;
    pkg.manifest.headerOverlay = false;
  }
  pkg.files["personal/design.css"] = `
/* Generated composition controls. Original fragments remain editable. */
.world.is-personal { --red: ${d.accent}; padding: 20px 24px 0; display: flex; flex-direction: column; gap: 28px; }
.is-personal .masthead { position: relative; height: auto; min-height: 410px; padding: 28px 24px; }
.is-personal .reference-header, .is-personal .motto, .is-personal .margin-note, .is-personal .wordmark { display: none !important; }
.is-personal .red-paper { display: block; inset: 0 5% 48% -25px; opacity: .95; background: var(--red); }
.is-personal .portrait { display: none !important; }
.is-personal .personal-avatar { display: grid; place-items:center; position: relative; width: ${d.portraitSize}px; height: ${d.portraitSize}px; border-radius:50%; border:5px solid var(--paper); background:var(--ink); color:var(--paper); overflow:hidden; font:700 42px Arial; ${d.alignment === "center" ? "margin-inline:auto;" : ""} }
.is-personal .personal-avatar img { width:100%; height:100%; object-fit:cover; }
.is-personal .masthead h1 { display:none; }
.is-personal .identity { position:relative; inset:auto; width:auto; margin-top:14px; text-align:${d.alignment}; }
.is-personal .identity strong { font:700 clamp(28px,4vw,40px)/1.1 Arial; }
.is-personal .handle { font:15px/1.6 Arial; }
.is-personal .bio { font:16px/1.5 Arial; margin:8px 0 14px; max-width:520px; white-space:normal; ${d.alignment === "center" ? "margin-inline:auto;" : ""} }
.is-personal .follow-line { justify-content:${d.alignment === "center" ? "center" : "flex-start"}; font:15px Arial; }
.is-personal .follow-line button { min-height:44px; padding:10px 26px; font:bold 15px Arial; }
.is-personal .drawing-hand { display:${d.illustrationVisible ? "block" : "none"}; position:absolute; top:${d.illustrationY}px; right:${d.illustrationX}px; width:${d.illustrationScale * 0.4}%; height:260px; pointer-events:none; z-index:0; }
${d.illustrationAssetId ? `.is-personal .drawing-hand { background: url("asset:${d.illustrationAssetId}") center/contain no-repeat; }.is-personal .drawing-hand use { display:none; }` : ""}
.is-personal .identity, .is-personal .personal-avatar { z-index:1; }
.is-personal .stories { position:relative; inset:auto; height:auto; margin:0; display:flex; justify-content:${d.alignment === "center" ? "center" : "flex-start"}; gap:20px; flex-wrap:wrap; }
.is-personal .story { font:14px Arial; width:90px; }
.is-personal .story > span:last-child { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.is-personal .story-icon { width:76px; height:76px; border-radius:${d.story === "circles" ? "50%" : "8px"}; margin-bottom:8px; }
.is-personal .story-icon { display:grid; place-items:center; background:var(--surface); border:1px solid var(--line); }
.is-personal .story-icon svg, .is-personal .story-icon img { border-radius:inherit; width:100%; height:100%; object-fit:cover; }
.is-personal .published-posts { margin:0; }
.is-personal .published-posts:before { display:none; }
.is-personal .post-grid { grid-template-columns:repeat(${d.columns},minmax(0,1fr)); gap:${d.gap}px; }
.is-personal .post-tile { transform:none !important; margin:0 !important; clip-path:${d.card === "cutout" ? "polygon(0 0,100% 0,100% 95%,94% 100%,0 100%)" : "none"} !important; border-radius:${d.card === "round" ? "22px" : "0"}; }
.is-personal .post-outline { display:${d.card === "cutout" ? "block" : "none"}; }
.is-personal .post-tile .art { aspect-ratio:1.1; }
.is-personal .post-tile strong { font:700 15px Arial; margin:12px 12px 5px; }
.is-personal .post-tile p { font:15px/1.45 Arial; margin:0 12px; min-height:2.9em; }
.is-personal .tile-actions { padding:8px; gap:6px; flex-wrap:wrap; }
.is-personal .tile-actions button { font:13px Arial; min-height:40px; min-width:34px; }
.is-personal .tile-actions svg { width:22px; height:22px; }
.is-personal .reference-continuation { display:none; }
.is-personal .relay { margin:0 0 20px; padding:28px; }
.is-personal .relay-mobile-drawing { display:none; }
@media(max-width:600px) {
 .world.is-personal { padding:12px 14px 16px; gap:22px; }
 .is-personal .masthead { min-height:0; padding:18px 6px; }
 .is-personal .drawing-hand { height:180px; }
 .is-personal .personal-avatar { width:min(${d.portraitSize}px,35vw); height:min(${d.portraitSize}px,35vw); }
 .is-personal .bio { font-size:14px; }
 .is-personal .post-grid { grid-template-columns:repeat(${Math.min(d.columns, 2)},minmax(0,1fr)); gap:${Math.min(d.gap, 16)}px; }
 .is-personal .post-tile strong, .is-personal .post-tile p { font-size:13px; margin-inline:8px; }
 .is-personal .tile-actions { padding:4px; gap:0; }
 .is-personal .relay { padding:20px; }
}
`;
  return profilePackageSchema.parse(pkg);
}
