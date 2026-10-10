import { z } from "zod";
import { partSlots, type ProfilePackage } from "./profile.js";

export const shareModSchema = z
  .object({
    submissionId: z.string().uuid(),
    draftId: z.string().uuid(),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(400),
    slots: z
      .array(z.enum(partSlots))
      .min(1)
      .max(4)
      .refine((s) => new Set(s).size === s.length),
    thumbnailAssetId: z.string().uuid().nullable().default(null),
    shareAssets: z.literal(true),
    modId: z.string().uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.modId) === Boolean(v.expectedVersion),
    "Updates require modId and expectedVersion",
  );
export const installModSchema = z
  .object({
    version: z.number().int().positive(),
    draftId: z.string().uuid().optional(),
    revision: z.number().int().positive().optional(),
    slot: z.enum(partSlots).optional(),
  })
  .strict()
  .refine(
    (v) => (v.draftId ? Boolean(v.revision && v.slot) : !v.revision && !v.slot),
    "Mixing requires a draft, revision and slot",
  );
export interface SharedMod {
  id: string;
  version: number;
  creatorId: string;
  name: string;
  description: string;
  slots: (typeof partSlots)[number][];
  createdAt: string;
  package: ProfilePackage;
  thumbnailAssetId: string | null;
  bundled?: boolean;
}
export type ModSummary = Omit<SharedMod, "package"> & {
  creatorName: string;
  capabilities: string[];
  assetCount: number;
};
