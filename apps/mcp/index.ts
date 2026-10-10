import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { profileIdentitySchema } from "../../packages/contracts/src/profile.js";

// Identity is bound by local server configuration, never a tool argument.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tokenPath = resolve(process.env.FORMA_DATA_DIR ?? resolve(root, ".local"), "mcp-token");
const server = new Server(
  { name: "forma-local", version: "0.1.0" },
  { capabilities: { tools: {} } },
);
const text = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  isError,
});
async function call(path: string, body?: unknown, method?: string) {
  try {
    const token = readFileSync(tokenPath, "utf8").trim();
    const response = await fetch(`http://127.0.0.1:3001/api${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    return text(await response.json(), !response.ok);
  } catch {
    return text(
      { error: "SERVER_UNAVAILABLE", message: "Run npm run dev in the project first." },
      true,
    );
  }
}
const string = { type: "string" },
  object = { type: "object" },
  id = { type: "string", format: "uuid" },
  revision = { type: "integer", minimum: 1 };
function tool(
  name: string,
  description: string,
  properties: Record<string, object> = {},
  required: string[] = [],
  readOnly = false,
): Tool {
  return {
    name,
    description,
    inputSchema: { type: "object", properties, required, additionalProperties: false },
    annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
  };
}
const tools: Tool[] = [
  tool(
    "list_profile_mods",
    "Browse the local shared mod library with authors, versions, parts and permissions.",
    {},
    [],
    true,
  ),
  tool(
    "read_profile_mod",
    "Read shared source for one immutable version, or the latest version when omitted.",
    { modId: id, version: revision },
    ["modId"],
    true,
  ),
  tool(
    "share_profile_mod",
    "Publish owned draft source and its declared assets to the local mod library when the user requests sharing. No identity, posts or votes are copied. Reuse submissionId on retry. Updates require an owned modId and expectedVersion.",
    {
      submissionId: id,
      draftId: id,
      revision,
      name: string,
      description: string,
      slots: {
        type: "array",
        items: { type: "string", enum: ["profile", "post", "story", "feature"] },
        minItems: 1,
        maxItems: 4,
        uniqueItems: true,
      },
      shareAssets: { const: true, type: "boolean" },
      thumbnailAssetId: { anyOf: [id, { type: "null" }] },
      modId: id,
      expectedVersion: revision,
    },
    ["submissionId", "draftId", "revision", "name", "description", "slots", "shareAssets"],
  ),
  tool(
    "install_profile_mod",
    "Try an immutable mod version as a new private draft. To mix one part, supply draftId, its revision, and slot. Never publishes the profile; conflicts are rejected.",
    {
      modId: id,
      version: revision,
      draftId: id,
      revision,
      slot: { type: "string", enum: ["profile", "post", "story", "feature"] },
    },
    ["modId", "version"],
  ),
  tool(
    "compose_profile_part",
    "Select one part from a v2 donor package, or remove it with null. Saves an owned draft revision without publishing. Conflicting filenames are rejected; rename them first. All parts share manifest permissions.",
    {
      draftId: id,
      revision,
      slot: { type: "string", enum: ["profile", "post", "story", "feature"] },
      donor: { anyOf: [object, { type: "null" }] },
    },
    ["draftId", "revision", "slot", "donor"],
  ),
  tool(
    "profile_spec",
    "Read the versioned public-profile contract, permissions, SDK and workflow.",
    {},
    [],
    true,
  ),
  tool(
    "profile_templates",
    "Read editable room and comic profile packages as starting points.",
    {},
    [],
    true,
  ),
  tool(
    "profile_data",
    "Read a user's public identity and published posts. No visitor private data.",
    { ownerId: string },
    ["ownerId"],
    true,
  ),
  tool("list_profile_drafts", "List Alex's profile drafts and full source.", {}, [], true),
  tool(
    "profile_history",
    "Read Alex's immutable published profile versions and current state.version for concurrency checks.",
    {},
    [],
    true,
  ),
  tool(
    "validate_profile_package",
    "Validate a profile package. Preview is still required to assess behavior.",
    { package: object },
    ["package"],
    true,
  ),
  tool(
    "create_profile_draft",
    "Create a private profile draft for Alex, without publishing.",
    { package: object },
    ["package"],
  ),
  tool(
    "update_profile_draft",
    "Replace an owned profile draft using its current revision. Optional identity stays private until publication; omit it to preserve the draft identity.",
    {
      draftId: id,
      revision,
      package: object,
      identity: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 300 },
          avatarAssetId: { anyOf: [id, { type: "null" }] },
        },
        required: ["name", "bio", "avatarAssetId"],
      },
    },
    ["draftId", "revision", "package"],
  ),
  tool(
    "preview_profile_draft",
    "Return the owned profile draft editor/visitor-preview URL.",
    { draftId: id },
    ["draftId"],
    true,
  ),
  tool(
    "publish_profile_draft",
    "Publish when requested by the user. Requires current draft revision and profile state.version as expectedVersion.",
    { draftId: id, revision, expectedVersion: { type: "integer", minimum: 0 } },
    ["draftId", "revision", "expectedVersion"],
  ),
  tool(
    "restore_profile",
    "Restore one of Alex's published profile versions, or null for the default profile, when requested by the user.",
    {
      publicationId: { type: ["string", "null"], format: "uuid" },
      expectedVersion: { type: "integer", minimum: 0 },
    },
    ["publicationId", "expectedVersion"],
  ),
  tool(
    "read_spec",
    "Read supported package versions, capabilities, SDK examples and local limits before authoring a post.",
    {},
    [],
    true,
  ),
  tool("list_drafts", "List Alex's drafts, including source and revision numbers.", {}, [], true),
  tool("list_feed", "Read published posts.", {}, [], true),
  tool(
    "list_media",
    "List Alex's and shared image assets. Reference asset:ID and declare IDs in manifest.assets.",
    {},
    [],
    true,
  ),
  tool(
    "upload_media",
    "Store JPEG/PNG/WebP base64 (max 3 MB decoded). No filesystem path access.",
    { name: string, mime: { enum: ["image/jpeg", "image/png", "image/webp"] }, base64: string },
    ["name", "mime", "base64"],
  ),
  tool(
    "validate_package",
    "Validate structure. This does not certify code safety; preview to test behavior.",
    { package: object },
    ["package"],
    true,
  ),
  tool(
    "create_draft",
    "Create an editable draft for Alex. Does not publish. metadata requires title; optional caption, format, coverAssetId (a declared package asset) and contributors (user IDs).",
    { package: object, metadata: object },
    ["package", "metadata"],
  ),
  tool(
    "update_draft",
    "Replace a draft package and metadata using its latest revision. Stale writes are rejected.",
    { draftId: id, revision, package: object, metadata: object },
    ["draftId", "revision", "package", "metadata"],
  ),
  tool(
    "preview_draft",
    "Return the studio URL for an owned draft. Opening is performed by your browser. Preview state is separate.",
    { draftId: id },
    ["draftId"],
    true,
  ),
  {
    ...tool(
      "publish_draft",
      "Publish the specified revision when the user requests publication. Published source is immutable; retrying the same revision returns the same post.",
      { draftId: id, revision },
      ["draftId", "revision"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name,
    args = request.params.arguments ?? {},
    definition = tools.find((t) => t.name === name);
  if (!definition) return text({ error: "UNKNOWN_TOOL" }, true);
  if (
    Object.keys(args).some((k) => !Object.hasOwn(definition.inputSchema.properties ?? {}, k)) ||
    (definition.inputSchema.required ?? []).some((k) => !Object.hasOwn(args, k))
  )
    return text({ error: "INVALID_ARGUMENTS" }, true);
  try {
    switch (name) {
      case "list_profile_mods":
        return call("/mods");
      case "read_profile_mod":
        return call(
          `/mods/${z.string().uuid().parse(args.modId)}${args.version === undefined ? "" : `?version=${z.number().int().positive().parse(args.version)}`}`,
        );
      case "share_profile_mod":
        return call("/mods", args);
      case "install_profile_mod": {
        const { modId, ...input } = args;
        return call(`/mods/${z.string().uuid().parse(modId)}/install`, input);
      }
      case "profile_spec":
        return call("/profile-spec");
      case "compose_profile_part":
        return call(`/profile-drafts/${z.string().uuid().parse(args.draftId)}/compose`, {
          revision: z.number().int().positive().parse(args.revision),
          slot: z.enum(["profile", "post", "story", "feature"]).parse(args.slot),
          donor: args.donor,
        });
      case "profile_templates":
        return call("/profile-templates");
      case "profile_data":
        return call(
          `/profiles/${encodeURIComponent(z.string().min(1).max(40).parse(args.ownerId))}/data`,
        );
      case "list_profile_drafts":
        return call("/profile-drafts");
      case "profile_history":
        return call("/profile-history");
      case "validate_profile_package":
        return call("/profile-validate", args.package);
      case "create_profile_draft":
        return call("/profile-drafts", args.package);
      case "update_profile_draft":
        return call(
          `/profile-drafts/${z.string().uuid().parse(args.draftId)}`,
          {
            package: args.package,
            revision: z.number().int().positive().parse(args.revision),
            ...(args.identity === undefined
              ? {}
              : { identity: profileIdentitySchema.parse(args.identity) }),
          },
          "PUT",
        );
      case "preview_profile_draft": {
        const id = z.string().uuid().parse(args.draftId);
        const r = await call(`/profile-drafts/${id}`);
        return r.isError
          ? r
          : text({
              url: `http://127.0.0.1:3000/?profile=you&profileDraft=${id}`,
              revision: JSON.parse(r.content[0]!.text).revision,
            });
      }
      case "publish_profile_draft":
        return call(`/profile-drafts/${z.string().uuid().parse(args.draftId)}/publish`, {
          revision: z.number().int().positive().parse(args.revision),
          expectedVersion: z.number().int().nonnegative().parse(args.expectedVersion),
        });
      case "restore_profile":
        return call("/profile-restore", {
          publicationId: z.string().uuid().nullable().parse(args.publicationId),
          expectedVersion: z.number().int().nonnegative().parse(args.expectedVersion),
        });
      case "read_spec":
        return call("/spec");
      case "list_drafts":
        return call("/drafts");
      case "list_feed":
        return call("/feed");
      case "list_media": {
        const r = await call("/bootstrap");
        return r.isError ? r : text(JSON.parse(r.content[0]!.text).assets);
      }
      case "upload_media":
        return call("/assets", args);
      case "validate_package":
        return call("/validate", args.package);
      case "create_draft":
        return call("/drafts", args);
      case "update_draft": {
        const draftId = z.string().uuid().parse(args.draftId);
        const { draftId: _, ...input } = args;
        return call(`/drafts/${draftId}`, input, "PUT");
      }
      case "preview_draft": {
        const draftId = z.string().uuid().parse(args.draftId);
        const r = await call(`/drafts/${draftId}`);
        return r.isError
          ? r
          : text({
              url: `http://127.0.0.1:3000/?draft=${draftId}`,
              revision: JSON.parse(r.content[0]!.text).revision,
            });
      }
      case "publish_draft":
        return call(`/drafts/${z.string().uuid().parse(args.draftId)}/publish`, {
          revision: z.number().int().positive().parse(args.revision),
        });
      default:
        return text({ error: "UNKNOWN_TOOL" }, true);
    }
  } catch {
    return text({ error: "INVALID_ARGUMENTS" }, true);
  }
});
await server.connect(new StdioServerTransport());
