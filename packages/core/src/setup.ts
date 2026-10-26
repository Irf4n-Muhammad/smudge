import { setupInputSchema } from "../../contracts/src/now.js";
import type { ProfilePackage, ProfileState } from "../../contracts/src/profile.js";
import { applyLook, defaultLook, lookKind, lookTints } from "./easy-look.js";
import type { Actor } from "./index.js";
import type { NowService } from "./now.js";
import {
  applyProfileDesign,
  defaultProfileDesign,
  supportsProfileDesign,
} from "./profile-design.js";
import type { ProfileService } from "./profiles.js";
import {
  applySmudgeSettings,
  defaultSmudgeSettings,
  readSmudgeSettings,
  smudgePalettes,
  smudgeVersionMarker,
  supportsSmudgeDesign,
} from "./smudge-design.js";
import { AppError } from "./social.js";

/** The colours a vibe offers, so the setup can show them before the page exists. */
export function setupColours(template: ProfilePackage): { key: string; colors: string[] }[] {
  if (supportsSmudgeDesign(template))
    return Object.entries(smudgePalettes).map(([key, colors]) => ({ key, colors: [...colors] }));
  const kind = lookKind(template);
  if (kind)
    return Object.entries(lookTints[kind]).map(([key, t]) => ({ key, colors: [...t.colors] }));
  return [];
}

/**
 * Five answers become a published page in one request (ADR 0041): the line goes to the bio and
 * the page, the vibe picks the template, the colour its palette, and the song and what you are
 * doing become the first two entries of your archive, shown on the page where it has a place.
 */
export function setupPage(
  profiles: ProfileService,
  now: NowService,
  templates: Record<string, ProfilePackage>,
  actor: Actor,
  input: unknown,
) {
  const value = setupInputSchema.parse(input);
  const template = templates[value.vibe];
  if (!template) throw new AppError("NOT_FOUND", 404);
  const colours = setupColours(template);
  if (value.colour && !colours.some((c) => c.key === value.colour))
    throw new AppError("VALIDATION_FAILED", 400);
  const song = value.song?.title ? value.song : undefined;
  let pkg: ProfilePackage;
  if (supportsSmudgeDesign(template)) {
    // The song and what you are doing sit in the hero (ADR 0046), under the name.
    pkg = applySmudgeSettings(template, {
      ...defaultSmudgeSettings,
      tagline: value.bio.slice(0, 60),
      ...(value.colour ? { palette: value.colour } : {}),
      now: { ...defaultSmudgeSettings.now, text: value.doing ?? "" },
      repeat: song ? { song: song.title, artist: song.artist } : defaultSmudgeSettings.repeat,
    });
  } else if (supportsProfileDesign(template)) {
    pkg = applyProfileDesign(template, defaultProfileDesign);
  } else {
    const kind = lookKind(template);
    pkg = kind
      ? applyLook(template, {
          ...defaultLook[kind],
          ...(value.colour ? { tint: value.colour } : {}),
        })
      : template;
  }
  const owner = profiles.social.users().find((u) => u.id === actor.userId)!;
  profiles.updateIdentity(actor, {
    name: owner.name,
    bio: value.bio,
    avatarAssetId: owner.avatarAssetId ?? null,
  });
  const draft = profiles.create(actor, pkg);
  const state = profiles.publish(
    actor,
    draft.id,
    draft.revision,
    profiles.state(actor.userId).version,
  );
  if (song) now.add(actor, { kind: "listening", text: song.title, by: song.artist });
  if (value.doing) now.add(actor, { kind: "doing", text: value.doing });
  return { publicationId: state.publicationId };
}

/**
 * Brings every published Paint wall up to the template's version at start (ADR 0046), so a page
 * made before a template change never keeps the old parts until its owner happens to edit. The
 * owner's settings are kept; only the template's files change. Returns the owners upgraded.
 */
export function upgradeSmudgePages(profiles: ProfileService, template: ProfilePackage) {
  const store = profiles.social.store;
  const upgraded: string[] = [];
  for (const ownerId of store.ids("profile-state")) {
    const state = store.get<ProfileState>("profile-state", ownerId);
    if (!state?.publicationId) continue;
    let pkg: ProfilePackage;
    try {
      pkg = profiles.publication(state.publicationId).package;
    } catch {
      continue;
    }
    if (!supportsSmudgeDesign(pkg)) continue;
    // Current when every template file that carries the marker is carried in the page too.
    const stale = Object.entries(template.files).some(
      ([path, src]) =>
        path.startsWith("smudge/") &&
        src.includes(smudgeVersionMarker) &&
        !pkg.files[path]?.includes(smudgeVersionMarker),
    );
    if (!stale) continue;
    const actor = { userId: ownerId };
    try {
      const next = applySmudgeSettings(pkg, readSmudgeSettings(pkg), template);
      const draft = profiles.create(actor, next);
      profiles.publish(actor, draft.id, draft.revision, state.version);
      upgraded.push(ownerId);
    } catch {
      // A page that cannot be rebuilt (missing assets, a closed account) stays as it is.
    }
  }
  return upgraded;
}
