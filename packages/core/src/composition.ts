import {
  profilePackageSchema,
  partSlots,
  type ProfilePackage,
} from "../../contracts/src/profile.js";
import { AppError } from "./social.js";
/** Composition is explicit and non-destructive; colliding source must be renamed by its author. */
export function composeProfilePart(
  base: ProfilePackage,
  donor: ProfilePackage | null,
  slot: (typeof partSlots)[number],
): ProfilePackage {
  if (base.manifest.schemaVersion !== 2 || (donor && donor.manifest.schemaVersion !== 2))
    throw new AppError("COMPOSITION_V2_REQUIRED");
  if (!partSlots.includes(slot)) throw new AppError("INVALID_SLOT");
  const next = structuredClone(base);
  if (next.manifest.schemaVersion !== 2) throw new AppError("COMPOSITION_V2_REQUIRED");
  const part = donor?.manifest.schemaVersion === 2 ? donor.manifest.parts[slot] : undefined;
  if (donor && !part) throw new AppError("PART_NOT_PROVIDED");
  const files = { ...base.files };
  if (donor)
    for (const [path, source] of Object.entries(donor.files)) {
      if (path === "index.html") continue;
      if (Object.hasOwn(files, path) && files[path] !== source)
        throw new AppError("PART_FILE_CONFLICT", 409);
      files[path] = source;
    }
  if (part) next.manifest.parts[slot] = part;
  else delete next.manifest.parts[slot];
  if (slot === "feature") {
    if (donor?.manifest.schemaVersion === 2 && donor.manifest.poll)
      next.manifest.poll = structuredClone(donor.manifest.poll);
    else delete next.manifest.poll;
  }
  const previouslyRequired = new Set(
    Object.values(base.manifest.parts).flatMap((p) => p?.capabilities ?? []),
  );
  next.manifest.capabilities = [
    ...new Set([
      ...base.manifest.capabilities.filter((c) => !previouslyRequired.has(c)),
      ...Object.values(next.manifest.parts).flatMap((p) => p?.capabilities ?? []),
    ]),
  ];
  next.manifest.assets = [...new Set([...base.manifest.assets, ...(donor?.manifest.assets ?? [])])];
  next.files = files;
  return profilePackageSchema.parse(next);
}
