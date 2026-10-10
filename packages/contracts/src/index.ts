import { z } from "zod";

// Adding a capability is a protocol change, not just a new string.
export const capabilitySchema = z.enum([
  "viewer.progress.read",
  "viewer.progress.write",
  "contributions.create",
]);

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    runtimeVersion: z.literal("web-v1"),
    name: z.string().trim().min(1).max(100),
    entrypoint: z.literal("index.html"),
    capabilities: z.array(capabilitySchema).max(3),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate capability" });
    }
  });

// Intentionally small text-only prototype format. Binary media is not implemented.
const filePathSchema = z
  .string()
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:html|css|js)$/);

export const postPackageSchema = z
  .object({
    manifest: manifestSchema,
    files: z.record(filePathSchema, z.string().max(100_000)),
  })
  .strict()
  .superRefine((postPackage, context) => {
    const paths = Object.keys(postPackage.files);
    if (paths.length > 20 || !paths.includes(postPackage.manifest.entrypoint)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Package must contain its entrypoint and at most 20 files",
      });
    }
  });

export type Capability = z.infer<typeof capabilitySchema>;
export type PostPackage = z.infer<typeof postPackageSchema>;

export const eventSchema = z
  .object({
    traceId: z.string().uuid(),
    operation: z.enum(["create_draft", "publish_post"]),
    stage: z.enum(["authorize", "validate_package", "commit"]),
    outcome: z.enum(["success", "failure"]),
    durationMs: z.number().nonnegative(),
    errorCode: z.enum(["UNAUTHENTICATED", "NOT_FOUND", "FORBIDDEN", "PACKAGE_INVALID"]).optional(),
    packageDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export type OperationEvent = z.infer<typeof eventSchema>;
