import { z } from "zod";
import { experienceSchema, type Experience } from "./experience.js";

const legacyMethod = z.enum(["profile.read", "profile.openPost"]);
export const profileMethod = z.enum([
  "profile.read",
  "profile.openPost",
  "profile.cover",
  "profile.social.read",
  "profile.social.toggle",
  "relay.read",
  "relay.add",
  "profile.poll.read",
  "profile.poll.vote",
]);
export const partSlots = ["profile", "post", "story", "feature"] as const;
// Public presentation fields only. Account ID, handle and authorization are never draft input.
export const profileIdentitySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    bio: z.string().trim().max(300),
    avatarAssetId: z.string().uuid().nullable(),
  })
  .strict();
export type ProfileIdentity = z.infer<typeof profileIdentitySchema>;
export const profilePartSchema = z
  .object({
    name: z.string().min(1).max(80),
    entrypoint: z.string().regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.html$/),
    capabilities: z.array(profileMethod).max(9),
  })
  .strict();
export const profilePollSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    question: z.string().trim().min(1).max(120),
    options: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
            label: z.string().trim().min(1).max(80),
          })
          .strict(),
      )
      .min(2)
      .max(8),
  })
  .strict()
  .refine(
    (p) => new Set(p.options.map((o) => o.id)).size === p.options.length,
    "Duplicate poll option",
  );
const common = {
  kind: z.literal("profile"),
  runtimeVersion: z.literal("web-v1"),
  name: z.string().trim().min(1).max(100),
  entrypoint: z.literal("index.html"),
  height: z.number().int().min(600).max(4000),
  assets: z.array(z.string().uuid()).max(12).default([]),
};
const manifest = z.discriminatedUnion("schemaVersion", [
  z
    .object({ ...common, schemaVersion: z.literal(1), capabilities: z.array(legacyMethod).max(2) })
    .strict(),
  z
    .object({
      ...common,
      schemaVersion: z.literal(2),
      mobileHeight: z.number().int().min(600).max(4000).optional(),
      headerOverlay: z.boolean().optional(),
      autoHeight: z.boolean().optional(),
      capabilities: z.array(profileMethod).max(9),
      poll: profilePollSchema.optional(),
      parts: z
        .object({
          profile: profilePartSchema.optional(),
          post: profilePartSchema.optional(),
          story: profilePartSchema.optional(),
          feature: profilePartSchema.optional(),
        })
        .strict(),
    })
    .strict(),
]);
export const profilePackageSchema = z
  .object({ manifest, files: z.record(z.string(), z.string()) })
  .strict()
  .superRefine((value, ctx) => {
    const error = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (new Set(value.manifest.capabilities).size !== value.manifest.capabilities.length)
      error("Duplicate capabilities");
    if (value.manifest.schemaVersion === 2) {
      if (
        value.manifest.capabilities.some((c) => c.startsWith("profile.poll.")) &&
        !value.manifest.poll
      )
        error("Poll capabilities require a poll definition");
      if (value.manifest.poll && !value.manifest.parts.feature)
        error("Poll belongs to the feature part");
      for (const slot of partSlots) {
        const part = value.manifest.parts[slot];
        if (!part) continue;
        if (part.entrypoint === "index.html" || !Object.hasOwn(value.files, part.entrypoint))
          error("Part must reference a local HTML fragment");
        if (!value.files["index.html"]?.includes(`<!--forma:${slot}-->`))
          error("Selected part requires a matching shell slot");
        for (const cap of part.capabilities)
          if (!(value.manifest.capabilities as string[]).includes(cap))
            error("Part requires a capability not granted by the manifest");
      }
    }
    // Validate raw files as well as the assembled output: inactive fragments are still untrusted.
    for (const doc of [rawDocument(value), profileDocument(value)]) {
      if (!experienceSchema.safeParse(doc).success)
        error(
          "Invalid profile files: at most 20 bounded local HTML/CSS/JS files, index.html required",
        );
    }
  });
export type ProfilePackage = z.infer<typeof profilePackageSchema>;
type DocumentInput = {
  manifest: {
    name: string;
    assets: string[];
    schemaVersion?: number;
    parts?: Partial<
      Record<(typeof partSlots)[number], z.infer<typeof profilePartSchema> | undefined>
    >;
  };
  files: Record<string, string>;
};
function rawDocument(value: DocumentInput): Experience {
  return {
    manifest: {
      schemaVersion: 2,
      runtimeVersion: "web-v1",
      name: value.manifest.name,
      entrypoint: "index.html",
      assets: value.manifest.assets,
      capabilities: [],
    },
    files: value.files,
  };
}
/** Fragments share one sandbox and capability set. This is composition, not per-mod isolation. */
export function profileDocument(value: DocumentInput): Experience {
  const doc = rawDocument(value);
  if (value.manifest.schemaVersion !== 2) return doc;
  const html = (value.files["index.html"] ?? "").replace(
    /<!--forma:(profile|post|story|feature)-->/g,
    (_all, slot: (typeof partSlots)[number]) => {
      const part = value.manifest.parts?.[slot];
      return part ? (value.files[part.entrypoint] ?? "") : "";
    },
  );
  return { ...doc, files: { ...value.files, "index.html": html } };
}
export const relayStrokeSchema = z
  .object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    width: z.number().min(1).max(12),
    points: z
      .array(z.tuple([z.number().finite().min(0).max(1000), z.number().finite().min(0).max(600)]))
      .min(1)
      .max(128),
  })
  .strict();
export const relaySubmissionSchema = z
  .object({ submissionId: z.string().uuid(), strokes: z.array(relayStrokeSchema).min(1).max(32) })
  .strict();
export interface RelayContribution {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  strokes: z.infer<typeof relayStrokeSchema>[];
}
export const profileRequestSchema = z
  .object({
    type: z.literal("forma:request"),
    id: z.string().uuid(),
    method: profileMethod,
    payload: z.unknown().optional(),
  })
  .strict();
export interface ProfileDraft {
  id: string;
  ownerId: string;
  revision: number;
  package: ProfilePackage;
  updatedAt: string;
  identity?: ProfileIdentity;
  /** Server-managed attribution; never accepted from a package or client draft body. */
  origins?: Partial<
    Record<(typeof partSlots)[number], { modId: string; version: number; modified: boolean }>
  >;
}
export interface ProfilePublication extends ProfileDraft {
  sourceDraftId: string;
  createdAt: string;
}
export interface ProfileState {
  ownerId: string;
  version: number;
  publicationId: string | null;
}

/** Layout requests are untrusted even from the current sandbox. */
export const profileSizeSchema = z
  .object({
    type: z.literal("forma:size"),
    nonce: z.string(),
    height: z.number().int().min(600).max(4000),
  })
  .strict();
