import { z } from "zod";
import { postPackageSchema } from "./index.js";

export const capabilities = [
  "viewer.progress.read",
  "viewer.progress.write",
  "contributions.create",
  "contributions.read",
  "polls.read",
  "polls.vote",
] as const;
export const capability = z.enum(capabilities);
export const manifestV2 = z
  .object({
    schemaVersion: z.literal(2),
    runtimeVersion: z.literal("web-v1"),
    name: z.string().trim().min(1).max(100),
    entrypoint: z.literal("index.html"),
    capabilities: z
      .array(capability)
      .max(6)
      .refine((v) => new Set(v).size === v.length, "Duplicate capability"),
    assets: z.array(z.string().uuid()).max(12).default([]),
    stage: z
      .object({
        background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        ink: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        nightBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        nightInk: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        height: z.number().int().min(560).max(960),
      })
      .strict()
      .optional(),
    poll: z
      .object({
        question: z.string().min(1).max(160),
        options: z.array(z.string().min(1).max(80)).min(2).max(6),
      })
      .strict()
      .optional(),
  })
  .strict();
export const experienceSchema = z.union([
  postPackageSchema,
  z
    .object({
      manifest: manifestV2,
      files: z.record(
        z
          .string()
          .max(120)
          .regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:html|css|js)$/),
        z.string().max(100_000),
      ),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (!Object.hasOwn(v.files, "index.html") || Object.keys(v.files).length > 20)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide index.html and at most 20 files",
        });
      if (v.manifest.capabilities.some((c) => c.startsWith("polls.")) && !v.manifest.poll)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Poll capabilities require a poll definition",
        });
    }),
]);
export type Experience = z.infer<typeof experienceSchema>;
export const metadataSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    caption: z.string().max(1000).default(""),
    coverAssetId: z.string().uuid().optional(),
    format: z.enum(["photo", "scrapbook", "story", "collaborative", "custom"]).default("custom"),
    contributors: z.array(z.string().max(40)).max(10).default([]),
  })
  .strict();
export type Metadata = z.infer<typeof metadataSchema>;
export const draftInputSchema = z
  .object({ package: experienceSchema, metadata: metadataSchema })
  .strict();
export const bridgeRequestSchema = z
  .object({
    type: z.literal("forma:request"),
    id: z.string().uuid(),
    method: capability,
    payload: z.unknown().optional(),
  })
  .strict();
export const contributionSchema = z
  .object({ text: z.string().trim().min(1).max(500), assetId: z.string().uuid().optional() })
  .strict();
export const progressSchema = z
  .record(
    z.string().max(50),
    z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
  )
  .refine((v) => Object.keys(v).length <= 20, "Too many state fields");
export interface User {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  bio: string;
  avatarAssetId?: string;
}
export interface PostView {
  id: string;
  ownerId: string;
  author: User;
  metadata: Metadata;
  digest: string;
  createdAt: string;
  likes: number;
  liked: boolean;
  comments: number;
  saved: boolean;
  manifest: Experience["manifest"];
}
export interface DraftView {
  id: string;
  ownerId: string;
  package: Experience;
  metadata: Metadata;
  revision: number;
  updatedAt: string;
}
