import { z } from "zod";
import { profilePackageSchema, type ProfilePackage } from "../../contracts/src/profile.js";
import { programCapabilities } from "../../contracts/src/programs.js";

/**
 * Easy-editor settings for the Smudge Paint wall landing page (ADR 0046): the name, the line,
 * the song and what's going on sit in the hero; posts live on the fixed Posts page; sections
 * are optional extras below. Like the Ink & Paper controls, they are
 * written as an ordinary source file (`smudge/settings.js`), so the advanced editor, MCP and mods
 * keep working on the same package.
 */
export const smudgeSectionKinds = [
  "latest",
  "selected",
  "quote",
  "countdown",
  "wall",
  "quiz",
  "cat",
] as const;
export type SmudgeSection = (typeof smudgeSectionKinds)[number];
export const smudgePalettes = {
  paint: ["#ff4f9a", "#d8ff3d", "#2b3cff", "#19c37d"],
  electric: ["#2b3cff", "#d8ff3d", "#ff4f9a", "#00c2ff"],
  sunset: ["#ff6a3d", "#ffc93d", "#ff3d8b", "#8a5cff"],
  ocean: ["#00a6c7", "#b8f3ff", "#1f4bff", "#19c37d"],
  mono: ["#101010", "#bdbdbd", "#5b5b5b", "#e8e8e8"],
} as const;
export type SmudgePalette = keyof typeof smudgePalettes;
const text = (max: number) => z.string().trim().max(max);
export const smudgeSettingsSchema = z
  .object({
    bigName: z.enum(["first", "full", "nickname"]),
    nickname: text(24),
    tagline: text(60),
    place: text(30),
    marquee: text(80),
    palette: z.enum(Object.keys(smudgePalettes) as [SmudgePalette, ...SmudgePalette[]]),
    sections: z
      .array(z.enum(smudgeSectionKinds))
      .max(smudgeSectionKinds.length)
      .refine((v) => new Set(v).size === v.length, "Use each section once"),
    quote: z.object({ text: text(120) }).strict(),
    now: z
      .object({ text: text(60), place: text(30), progress: z.number().int().min(0).max(100) })
      .strict(),
    repeat: z.object({ song: text(50), artist: text(50) }).strict(),
    countdown: z
      .object({ label: text(40), date: z.union([z.literal(""), z.string().date()]) })
      .strict(),
    wall: z.object({ title: text(40) }).strict(),
    quiz: z.object({ title: text(40) }).strict(),
    cat: z.object({ name: text(20) }).strict(),
  })
  .strict();
export type SmudgeSettings = z.infer<typeof smudgeSettingsSchema>;
export const defaultSmudgeSettings: SmudgeSettings = {
  bigName: "first",
  nickname: "",
  tagline: "",
  place: "",
  marquee: "",
  palette: "paint",
  sections: [],
  quote: { text: "" },
  now: { text: "", place: "", progress: 40 },
  repeat: { song: "", artist: "" },
  countdown: { label: "", date: "" },
  wall: { title: "The Wall" },
  quiz: { title: "" },
  cat: { name: "" },
};
export const wallCapabilities = [
  "profile.wall.read",
  "profile.wall.add",
  "profile.wall.remove",
] as const;
const settingsFile = "smudge/settings.js";
/** Files from this version on carry the marker; older copies are refreshed from the template. */
export const smudgeVersionMarker = "smudge:v6";

export function supportsSmudgeDesign(pkg: ProfilePackage) {
  return (
    pkg.manifest.schemaVersion === 2 &&
    Boolean(pkg.files["smudge/helpers.js"]) &&
    Boolean(pkg.files["index.html"]?.includes('class="wall sm"'))
  );
}
export function readSmudgeSettings(pkg: ProfilePackage): SmudgeSettings {
  const source = pkg.files[settingsFile];
  const match = source ? /^window\.smudgeSettings = (.+);\s*$/s.exec(source) : null;
  if (!match) return structuredClone(defaultSmudgeSettings);
  try {
    const value = JSON.parse(match[1]!) as Partial<SmudgeSettings>;
    // Sections that moved into the hero or the fixed pages (ADR 0046) are dropped quietly.
    const sections = (value.sections ?? []).filter((k) =>
      (smudgeSectionKinds as readonly string[]).includes(k),
    );
    return smudgeSettingsSchema.parse({ ...defaultSmudgeSettings, ...value, sections });
  } catch {
    return structuredClone(defaultSmudgeSettings);
  }
}
/**
 * Writes the settings file, and brings an older Paint wall copy up to the template's version so the
 * settings have something to act on. Files someone already rewrote at this version are kept.
 */
export function applySmudgeSettings(
  input: ProfilePackage,
  settings: unknown,
  template?: ProfilePackage,
): ProfilePackage {
  const pkg = structuredClone(profilePackageSchema.parse(input));
  const s = smudgeSettingsSchema.parse(settings);
  if (!supportsSmudgeDesign(pkg) || pkg.manifest.schemaVersion !== 2)
    throw new Error("This profile has no easy controls. Use its source editor.");
  if (template)
    for (const [path, source] of Object.entries(template.files))
      if (
        path.startsWith("smudge/") &&
        path !== settingsFile &&
        !pkg.files[path]?.includes(smudgeVersionMarker)
      )
        pkg.files[path] = source;
  let shell = pkg.files["index.html"]!;
  if (!shell.includes('src="smudge/sections.js"'))
    shell = '<script src="smudge/sections.js"></script>\n' + shell;
  if (!shell.includes(`src="${settingsFile}"`))
    shell = `<script src="${settingsFile}"></script>\n` + shell;
  if (!shell.includes('id="sm-sections"'))
    shell = shell.includes('<footer class="wall-foot">')
      ? shell.replace(
          '<footer class="wall-foot">',
          '<div class="sm-sections" id="sm-sections"></div>\n  <footer class="wall-foot">',
        )
      : shell.replace("</main>", '<div class="sm-sections" id="sm-sections"></div>\n</main>');
  pkg.files["index.html"] = shell;
  pkg.files[settingsFile] = `window.smudgeSettings = ${JSON.stringify(s)};`;
  // Sections between people need grants; each gets them only while it is on the page, so the
  // permission list always says what the page can do (ADR 0043).
  const granted: Record<string, readonly string[]> = {
    wall: wallCapabilities,
    quiz: programCapabilities.quiz,
    cat: programCapabilities.cat,
  };
  const all = Object.values(granted).flat();
  const caps: string[] = pkg.manifest.capabilities.filter((c) => !all.includes(c));
  for (const [kind, list] of Object.entries(granted))
    if (s.sections.includes(kind as SmudgeSection)) caps.push(...list);
  if (caps.length > 12)
    throw new Error("This profile already uses too many features to add this section.");
  pkg.manifest.capabilities = caps as typeof pkg.manifest.capabilities;
  pkg.manifest.autoHeight = true;
  return profilePackageSchema.parse(pkg);
}
