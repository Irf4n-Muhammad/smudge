# Connect an external AI to Forma

## Public profile authoring

`list_profile_mods`, `read_profile_mod`, `share_profile_mod`, and `install_profile_mod` expose the
local library. Read a version's source/permissions before installation. Install with `{modId,version}`
for a new private draft, or add `{draftId,revision,slot}` to mix one part. Sharing takes
`{submissionId,draftId,revision,name,description,slots,shareAssets:true}` with optional thumbnailAssetId.
It publishes all source/dependencies and declared assets, not account identity or content; do it
when the user requests sharing. Reuse submissionId on retry. For a new version, include the owned
modId and current expectedVersion. Preview/publish the resulting draft through the existing tools.
The profile spec documents generic `manifest.poll` and `forma.profile.poll` for custom voting parts.

The same local connection also exposes `profile_spec`, `profile_templates`, `profile_data`,
`list_profile_drafts`, `profile_history`, `validate_profile_package`, `create_profile_draft`,
`update_profile_draft`, `preview_profile_draft`, `publish_profile_draft`, and `restore_profile`.
Read `profile_spec` first. `profile_data` takes a public ownerId; every editing tool is bound to
Alex regardless of the browser's simulated account. A different owner's private draft cannot be read.

Create takes `{package}`. Update takes `{draftId, revision, package, identity?}`. Optional identity
is `{name, bio, avatarAssetId}` (UUID or null); it is private until publication. Omission preserves
the draft snapshot. It cannot choose an actor or handle; avatars must be owned/shared assets.
Preview returns
`/?profile=you&profileDraft=UUID`, which opens the saved package as a visitor preview in the editor.
Publish takes `{draftId, revision, expectedVersion}`; get expectedVersion from
`profile_history.state.version`. Restore takes `{publicationId, expectedVersion}`; null selects
the default profile. Fetch current history after publication/restoration rather than assuming
an old version still applies. Publish/restore only when requested by the user.

Example prompt: “Read the profile spec and my public data. Make a profile that looks like a
workshop, with each object opening one of my posts. Create a draft and give me its preview.”
Arbitrary local HTML/CSS/JS is supported within the profile contract; the two supplied templates
are examples, not a required renderer. The existing post tools remain unchanged.

Forma does not include a model. Any local MCP client that supports stdio can launch the official
SDK-based server. Hosted/remote OAuth connections are not configured. The browser can be used
without an AI connection.

## Start and connect

1. Run `npm run dev` in the project and keep it running.
2. Add a stdio server to your MCP client's configuration. Adapt the outer configuration keys to
   that client; the command and arguments below are the actual launcher.

```json
{
  "mcpServers": {
    "forma-local": {
      "command": "node",
      "args": ["D:/Social Media/scripts/mcp.mjs"]
    }
  }
}
```

Use an absolute node executable if your client does not inherit PATH. If the repository is moved,
update the script path. The launcher sets the correct working directory, even when the client
starts elsewhere. Do not use `npm run mcp` as a JSON-RPC transport: npm may print a banner to stdout.

The server generates `.local/mcp-token` on first startup. The launcher reads it locally and forwards
API requests with it; never paste it into chat, source, browser code, or a commit. It is bound to
Alex (`you`), not whichever demo account the browser currently displays. A tool cannot choose
another identity. Keep the local app running when calling tools.

## Tools

| Tool             | Result                                                                     |
| ---------------- | -------------------------------------------------------------------------- |
| read_spec        | Supported versions, limits, SDK calls and example package                  |
| list_drafts      | Alex's drafts, source, metadata and revision numbers                       |
| list_feed        | Published feed metadata                                                    |
| list_media       | Alex's and shared image IDs                                                |
| upload_media     | Store base64 JPEG, PNG or WebP; return an asset ID                         |
| validate_package | Validate shape; not a safety certification                                 |
| create_draft     | Store package and metadata without publishing                              |
| update_draft     | Replace source/metadata, checking expected revision                        |
| preview_draft    | Return a studio URL for an owned draft                                     |
| publish_draft    | Publish a specific revision; duplicate retries return the same publication |

Example request to your AI:

> Read Forma's specification. Make a pocket observatory where a button moves the moon through
> three phases and remembers my place. Create a draft and give me the preview link. Publish after
> I ask you to publish.

The browser must be set to Alex to open an MCP draft preview. Other demo accounts can view the
published result. Preview interactions have separate state and do not carry into publication.

## Verification and limits

`npm run test:e2e` uses the official MCP client over real stdio, discovers tools, creates a custom
interaction, revises it, obtains a preview link, publishes, and exercises it in the browser as a
second account. This does not claim every third-party AI client's configuration has been tested.

There is no arbitrary server-code execution, filesystem-reading tool, external network in posts,
or paid API call. Media tools accept data, not local file paths. The local credential grants broad
access to Alex's demo content; per-tool OAuth scopes are future work before any public deployment.

### Modular profiles

`profile_spec` lists supported profile versions and relay limits; `profile_templates` now also
returns `raka` (all four parts) and `basic` (profile/post/story only). `compose_profile_part` takes
`{draftId,revision,slot,donor}` and saves an owned draft with that part replaced, or removed when
`donor:null`. It never publishes. Preview via `preview_profile_draft`, then publish the returned
revision with the current profile state.version. Permission changes are visible in the manifest.
Source editing and import still support new original parts, not just the two examples. Use distinct
file namespaces; same-path different-content conflicts fail instead of overwriting source.
