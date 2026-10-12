import { z } from "zod";
import { profilePackageSchema, type ProfilePackage } from "../../contracts/src/profile.js";

/**
 * Easy-editor controls for the single-page Room and Comic vibes: a colour tint and the one big line
 * each of them shows. Like the Paint wall settings they are ordinary source (a marked block at the
 * top of index.html), so the advanced editor and MCP keep working on the same file.
 */
export const lookTints = {
  room: {
    cream: { name: "Cream", colors: ["#ded5bc", "#f4eedc", "#866b4b"] },
    sage: { name: "Sage", colors: ["#c9d3bd", "#eef0e2", "#6f7a5a"] },
    rose: { name: "Rose", colors: ["#e8cfc8", "#f7ece6", "#8a5a4f"] },
    sky: { name: "Sky", colors: ["#c8d6e2", "#eef3f6", "#5d6f80"] },
    sun: { name: "Sun", colors: ["#ecd9a0", "#fbf3d9", "#8b6a2e"] },
  },
  comic: {
    red: { name: "Red", colors: ["#e66344"] },
    blue: { name: "Blue", colors: ["#3d6be6"] },
    yellow: { name: "Yellow", colors: ["#f2c230"] },
    green: { name: "Green", colors: ["#3bb273"] },
    pink: { name: "Pink", colors: ["#ec5f9c"] },
  },
} as const;
export type LookKind = keyof typeof lookTints;
export const lookSettingsSchema = z
  .object({
    tint: z.string().regex(/^[a-z]{1,12}$/),
    /** The room's pinned note, or the comic's big opening line. Empty keeps the template's. */
    line: z.string().trim().max(60),
  })
  .strict();
export type LookSettings = z.infer<typeof lookSettingsSchema>;
export const defaultLook: Record<LookKind, LookSettings> = {
  room: { tint: "cream", line: "" },
  comic: { tint: "red", line: "" },
};
const blockPattern = /<!-- smudge-look:start -->[\s\S]*?<!-- smudge-look:end -->\n?/;

/** Room and Comic are recognised by their markup, so copies made before this existed work too. */
export function lookKind(pkg: ProfilePackage): LookKind | null {
  const shell = pkg.files["index.html"] ?? "";
  if (shell.includes('<main class="room">') && shell.includes('id="bio"')) return "room";
  if (shell.includes('<section class="opening">') && shell.includes('id="panels"')) return "comic";
  return null;
}
export function readLook(pkg: ProfilePackage): LookSettings | null {
  const kind = lookKind(pkg);
  if (!kind) return null;
  const match = /<script>window\.smudgeLook = (.+?);<\/script>/.exec(pkg.files["index.html"]!);
  try {
    const value = match ? lookSettingsSchema.parse(JSON.parse(match[1]!)) : defaultLook[kind];
    return value.tint in lookTints[kind] ? value : { ...value, tint: defaultLook[kind].tint };
  } catch {
    return { ...defaultLook[kind] };
  }
}
export function applyLook(input: ProfilePackage, settings: unknown): ProfilePackage {
  const pkg = structuredClone(profilePackageSchema.parse(input));
  const kind = lookKind(pkg);
  if (!kind) throw new Error("This profile has no easy controls. Use its source editor.");
  const look = lookSettingsSchema.parse(settings);
  const tints = lookTints[kind] as Record<string, { colors: readonly string[] }>;
  const tint = tints[look.tint];
  if (!tint) throw new Error("Pick one of this vibe's colours.");
  const [a, b, c] = tint.colors;
  const css =
    kind === "room"
      ? `html:not([data-theme="dark"]){--wall:${a};--paper:${b};--wood:${c}}`
      : `html:not([data-theme="dark"]){--red:${a}}`;
  // JSON in a script: "<" is escaped so the line can never close the tag.
  const data = JSON.stringify(look).replace(/</g, "\\u003c");
  const block = `<!-- smudge-look:start -->
<style>${css}
.look-avatar{display:grid;place-items:center;width:64px;height:64px;margin-bottom:10px;border-radius:50%;overflow:hidden;background:var(--ink);color:var(--paper,#fff);font:700 22px Arial,sans-serif}
.look-avatar img{width:100%;height:100%;object-fit:cover}</style>
<script>window.smudgeLook = ${data};</script>
<script>
document.addEventListener("DOMContentLoaded", () => {
  const look = window.smudgeLook;
  const kind = ${JSON.stringify(kind)};
  for (const id of ["name", "bio", "handle"]) document.getElementById(id)?.setAttribute("data-edit", "about");
  const line = document.querySelector(kind === "room" ? ".note" : ".opening h2");
  if (line) {
    line.setAttribute("data-edit", "line");
    if (look.line) line.textContent = look.line;
  }
  const name = document.getElementById("name");
  if (!name || !window.forma) return;
  forma.profile.read().then((d) => {
    const avatar = document.createElement("div");
    avatar.className = "look-avatar";
    avatar.setAttribute("data-edit", "photo");
    if (d.owner.avatarSrc) {
      const img = document.createElement("img");
      img.src = d.owner.avatarSrc;
      img.alt = d.owner.name + " photo";
      avatar.append(img);
    } else avatar.textContent = d.owner.initials;
    name.parentElement.prepend(avatar);
  }).catch(() => {});
});
</script>
<!-- smudge-look:end -->
`;
  const shell = pkg.files["index.html"]!.replace(blockPattern, "");
  pkg.files["index.html"] = block + shell;
  return profilePackageSchema.parse(pkg);
}
