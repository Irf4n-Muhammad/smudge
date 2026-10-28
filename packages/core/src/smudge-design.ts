import { z } from "zod";
import {
  profilePackageSchema,
  type PageLook,
  type ProfilePackage,
} from "../../contracts/src/profile.js";
import { programCapabilities } from "../../contracts/src/programs.js";

/**
 * Easy-editor settings for the Smudge Paint wall landing page (ADR 0048): the name, the line,
 * the song and what's going on sit in the poster hero; chapters below say who this is with one
 * measurable thing each; posts live on the fixed Posts page; sections are optional extras. Like the Ink & Paper controls, they are
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
  /** The default (ADR 0052): teal, a warm yellow accent, clay and violet on the dark ground. */
  night: ["#2ba39a", "#f2c53d", "#e8613c", "#7a5af8"],
  paint: ["#ff4f9a", "#d8ff3d", "#2b3cff", "#19c37d"],
  electric: ["#2b3cff", "#d8ff3d", "#ff4f9a", "#00c2ff"],
  sunset: ["#ff6a3d", "#ffc93d", "#ff3d8b", "#8a5cff"],
  ocean: ["#00a6c7", "#b8f3ff", "#1f4bff", "#19c37d"],
  mono: ["#101010", "#bdbdbd", "#5b5b5b", "#e8e8e8"],
} as const;
export type SmudgePalette = keyof typeof smudgePalettes;
/**
 * What the Paint wall tells the app about itself (ADR 0049): the dark ground, the ink, and the
 * palette's second colour as the accent, so Posts, Stories and the strip read as the same page.
 * The whole palette goes along as tints (ADR 0052), for the blocks of the Posts page.
 */
export const smudgeLook = (palette: SmudgePalette, look: SmudgeLookKind = "wall"): PageLook =>
  look === "track"
    ? {
        // The Track (ADR 0057): cream paper, dark ink, one lime, the olive of the dark band.
        ground: "#f3f2ec",
        ink: "#171a12",
        muted: "#6f7266",
        card: "#ffffff",
        accent: "#d9ff2f",
        tints: ["#d9ff2f", "#272b1e", "#9bb300", "#171a12"],
        display: "serif",
        label: "mono",
      }
    : {
        ground: "#0e0d0b",
        ink: "#f3efe6",
        muted: "#9a948a",
        card: "#1a1816",
        accent: smudgePalettes[palette][1],
        tints: [...smudgePalettes[palette]],
        display: "serif",
        label: "mono",
      };
/**
 * The two ways the one Smudge page can be drawn (ADR 0057): the Paint wall, dark with the
 * palette's paints, and the Track, cream with contour lines and a lime, the person cut out of
 * their photo in front of their name. Same files, same settings, one switch.
 */
export const smudgeLookKinds = ["wall", "track"] as const;
export type SmudgeLookKind = (typeof smudgeLookKinds)[number];
const text = (max: number) => z.string().trim().max(max);
/** One of the owner's uploaded photos laid on the page with a place and a year (ADR 0053). */
export const snapSchema = z.object({ photo: z.string().uuid(), caption: text(30) }).strict();
export type Snap = z.infer<typeof snapSchema>;
export const chapterKinds = ["run", "work", "music", "custom"] as const;
export type ChapterKind = (typeof chapterKinds)[number];
/** One chapter of the landing: a kind, a title, one big number, a note, up to three stats and lines. */
export const chapterSchema = z
  .object({
    kind: z.enum(chapterKinds),
    label: text(24),
    title: text(40),
    big: text(16),
    unit: text(12),
    note: text(120),
    stats: z.array(z.object({ value: text(12), label: text(16) }).strict()).max(3),
    lines: z.array(text(40)).max(3),
    /** One of the owner's uploaded photos (ADR 0050), or none, with a caption under it. */
    photo: z.union([z.literal(""), z.string().uuid()]).default(""),
    caption: text(40).default(""),
    /** Up to two more photos laid around the chapter (ADR 0053). */
    snaps: z.array(snapSchema).max(2).default([]),
  })
  .strict();
export type Chapter = z.infer<typeof chapterSchema>;
export const emptyChapter: Chapter = {
  kind: "custom",
  label: "",
  title: "",
  big: "",
  unit: "",
  note: "",
  stats: [],
  lines: [],
  photo: "",
  caption: "",
  snaps: [],
};
export const smudgeSettingsSchema = z
  .object({
    bigName: z.enum(["first", "full", "nickname"]),
    nickname: text(24),
    tagline: text(60),
    /** A few sentences in the owner's words, set huge under the hero (ADR 0054). */
    manifesto: text(140),
    place: text(30),
    chapters: z.array(chapterSchema).max(3),
    /** A band of photos from the roll, laid freely under the chapters (ADR 0053). */
    roll: z.array(snapSchema).max(8).default([]),
    /** Which drawing of the page (ADR 0057). */
    look: z.enum(smudgeLookKinds).default("wall"),
    /** The owner, cut out of a photo: a PNG with a transparent ground (the Track's hero). */
    cutout: z.union([z.literal(""), z.string().uuid()]).default(""),
    /** Up to two of the owner's things, cut out the same way, each with a sticker line. */
    things: z.array(snapSchema).max(2).default([]),
    /** The next thing on the owner's calendar, for the Track's corner card. */
    next: z
      .object({ title: text(30), when: text(20) })
      .strict()
      .default({ title: "", when: "" }),
    /** Affiliations (ADR 0057, stage three): a name and a line each, drawn as crests. */
    crews: z
      .array(z.object({ name: text(24), line: text(24) }).strict())
      .max(4)
      .default([]),
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
  manifesto: "",
  place: "",
  chapters: [],
  roll: [],
  look: "wall",
  cutout: "",
  things: [],
  next: { title: "", when: "" },
  crews: [],
  palette: "night",
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
export const smudgeVersionMarker = "smudge:v14";
/** Every photo the settings lay on the page: chapter photos and snaps, the roll, the cutouts. */
export const smudgePhotoIds = (s: SmudgeSettings) => [
  ...new Set(
    [
      ...s.chapters.flatMap((c) => [c.photo, ...c.snaps.map((p) => p.photo)]),
      ...s.roll.map((p) => p.photo),
      s.cutout,
      ...s.things.map((p) => p.photo),
    ].filter(Boolean),
  ),
];

export function supportsSmudgeDesign(pkg: ProfilePackage) {
  return (
    pkg.manifest.schemaVersion === 2 &&
    Boolean(pkg.files["smudge/helpers.js"]) &&
    Boolean(pkg.files["index.html"]?.includes('class="wall sm"'))
  );
}
export function readSmudgeSettings(pkg: ProfilePackage): SmudgeSettings {
  const source = pkg.files[settingsFile];
  const match = source ? /^window\.smudgeSettings = ([^\n]+);/.exec(source) : null;
  if (!match) return structuredClone(defaultSmudgeSettings);
  try {
    const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
    // Settings a past version wrote and this one dropped (the ribbon) are ignored quietly, and so
    // are sections that moved into the hero or the fixed pages (ADR 0046).
    const value: Partial<SmudgeSettings> = {};
    for (const key of Object.keys(defaultSmudgeSettings) as (keyof SmudgeSettings)[])
      if (key in parsed) (value as Record<string, unknown>)[key] = parsed[key];
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
  // The shell learns the look before any part draws (ADR 0057), so the ground is right at once.
  if (!shell.includes("dataset.look"))
    shell = shell.replace(
      '<script src="smudge/sections.js"></script>',
      '<script src="smudge/sections.js"></script>\n<script>document.documentElement.dataset.look=(window.smudgeSettings||{}).look||"wall"</script>',
    );
  if (!shell.includes('id="sm-sections"'))
    shell = shell.includes('<footer class="wall-foot">')
      ? shell.replace(
          '<footer class="wall-foot">',
          '<div class="sm-sections" id="sm-sections"></div>\n  <footer class="wall-foot">',
        )
      : shell.replace("</main>", '<div class="sm-sections" id="sm-sections"></div>\n</main>');
  pkg.files["index.html"] = shell;
  // The page's photos are its assets (ADR 0050, 0053): the ones the last settings named make way
  // for these, and the runtime fills `smudgePhotos` with their data URLs when it serves the page.
  const before = new Set(smudgePhotoIds(readSmudgeSettings(pkg)));
  const photos = smudgePhotoIds(s);
  const assets = [...new Set([...pkg.manifest.assets.filter((id) => !before.has(id)), ...photos])];
  if (assets.length > 20) throw new Error("This page already carries too many pictures.");
  pkg.manifest.assets = assets;
  pkg.files[settingsFile] =
    `window.smudgeSettings = ${JSON.stringify(s)};\n` +
    `window.smudgePhotos = ${JSON.stringify(Object.fromEntries(photos.map((id) => [id, `asset:${id}`])))};`;
  // Sections between people need grants; each gets them only while it is on the page, so the
  // permission list always says what the page can do (ADR 0043).
  const granted: Record<string, readonly string[]> = {
    wall: wallCapabilities,
    quiz: programCapabilities.quiz,
    cat: programCapabilities.cat,
  };
  // The page has no follow button of its own any more (ADR 0048): the app's strip carries it.
  const all = [...Object.values(granted).flat(), "profile.social.toggle"];
  const caps: string[] = pkg.manifest.capabilities.filter((c) => !all.includes(c));
  const profilePart = pkg.manifest.parts?.profile;
  if (profilePart)
    profilePart.capabilities = profilePart.capabilities.filter(
      (c) => c !== "profile.social.toggle",
    ) as typeof profilePart.capabilities;
  for (const [kind, list] of Object.entries(granted))
    if (s.sections.includes(kind as SmudgeSection)) caps.push(...list);
  if (caps.length > 12)
    throw new Error("This profile already uses too many features to add this section.");
  pkg.manifest.capabilities = caps as typeof pkg.manifest.capabilities;
  pkg.manifest.autoHeight = true;
  pkg.manifest.look = smudgeLook(s.palette, s.look);
  return profilePackageSchema.parse(pkg);
}
