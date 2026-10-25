# Experience contracts

## Public profile packages (separate v1 contract)

`packages/contracts/src/profile.ts` defines a separate `kind: "profile"` package. Post versions
remain unchanged. Example:

```json
{
  "manifest": {
    "kind": "profile",
    "schemaVersion": 1,
    "runtimeVersion": "web-v1",
    "name": "My own place",
    "entrypoint": "index.html",
    "height": 1000,
    "assets": [],
    "capabilities": ["profile.read", "profile.openPost"]
  },
  "files": {
    "index.html": "<h1 id='name'></h1><script>forma.profile.read().then(d=>document.getElementById('name').textContent=d.owner.name)</script>"
  }
}
```

Height is an integer 600–4000 CSS pixels. The same post file/path and asset limits apply.
Larger documents scroll inside the frame; automatic content sizing is not implemented.
Profile capabilities are independent of post capabilities:

- `profile.read`: `await forma.profile.read()` returns `{owner, posts}`. Owner is the public
  user record; posts contain only `id`, `title`, `caption`, `format`, `hasCover`. No draft, bookmark, session,
  or viewer identity is supplied, including in visitor preview.
- `profile.openPost`: `await forma.profile.openPost(postId)` asks the host to open a published
  post. The server checks that it belongs to this profile owner before the host opens it.

Declared assets must belong to the author or the shared demo namespace. Profile code cannot
follow, report, publish or restore; those operations remain in host UI/API/MCP with actor checks.
Theme is delivered through `forma:appearance` as before; reduced motion sets
`html[data-motion=reduce]` and the injected SDK disables CSS animations/transitions. Authors must
also respect system reduced-motion settings and the attribute in JavaScript animations; it is
a preference, not a hard execution quota. Autoplay is not granted to frames.

Draft writes require their current revision. Publishing requires that revision plus the current
profile state `version` as `expectedVersion`. It writes an immutable snapshot and atomically
advances the active pointer/version. A retry of the just-completed publish is idempotent; stale
writes after a restore fail with `PROFILE_CONFLICT`. Restore accepts an owned publication ID or
null (default profile), with current expectedVersion. It never edits or deletes the snapshots.

Runtime tickets distinguish profile/post, bind the viewer/session and immutable target, and bind
preview to a draft revision. Foreign previews, stale previews and cross-session replay fail.
The browser and server each validate the appropriate bridge schema before handling a request.

Executable definitions: `packages/contracts/src/experience.ts` and the original v1 `index.ts`.
Do not silently change old package semantics. New incompatible behavior requires a new version
and compatibility fixtures. A published revision is immutable.

## v2 example

```json
{
  "manifest": {
    "schemaVersion": 2,
    "runtimeVersion": "web-v1",
    "name": "A little notebook",
    "entrypoint": "index.html",
    "capabilities": ["viewer.progress.read", "viewer.progress.write"],
    "assets": []
  },
  "files": {
    "index.html": "<button id='next'>Next page</button><script>document.getElementById('next').onclick=()=>forma.progress.write({page:2})</script>"
  }
}
```

Package limits: strict known object fields; at most 20 html/css/js text files; 100,000 JavaScript
string code units per file; 120 characters per path; mandatory index.html; name 1-100 characters.
Path segments allow alphanumerics, underscore and hyphen. No traversal or absolute paths.
The HTTP layer rejects bodies over 6 MB before schema validation.

Classic inline JavaScript and quoted local script `src` / stylesheet `href` references are supported.
This is not an npm bundler: no import resolution, remote dependencies, eval or server-side code.
Files and asset references are processed from the package, never read as host filesystem paths.
Package validation checks shape and resource references, not safety of arbitrary program behavior.

## World stages and appearance

v2 may add `manifest.stage` to request a full-width world. Existing packages without it keep
their original presentation. The strict object requires `background`, `ink`, `nightBackground`,
and `nightInk` as six-digit hex colors, plus integer `height` from 560 to 960 CSS pixels.
These bounded values style the host stage; arbitrary host CSS is not accepted.

The host supplies light/dark appearance through the nonce-bound `forma:appearance` message.
The SDK checks the parent window and nonce, sets `document.documentElement.dataset.theme`,
and dispatches `forma:theme`. Read `forma.appearance.theme` or style
`html[data-theme="dark"]`. Appearance does not require a data capability and does not reload
the experience. Authors choose their own night palette; existing artwork is never inverted.
The message may also carry `season` (`paint` or `halloween`, additive): the SDK sets
`html[data-season]` and exposes `forma.appearance.season` (default `paint`). Older hosts omit it
and older packages ignore it; it never changes a package's content on its own.
Use a transparent body to blend with the stage. The host keeps the iframe's CSS color scheme
normal so browser dark-mode canvas defaults do not turn transparent worlds opaque.

## Assets

v2 declares up to 12 UUID asset IDs in `manifest.assets`. Reference them as `asset:UUID` in HTML/CSS;
the renderer embeds local bytes. Upload supports JPEG/PNG/WebP, max 3 MB decoded, with MIME/signature
checks. The creator must own an asset or use a shared demo asset before publishing it. Publication
makes declared media viewable with the public post. No video processing is implemented.

## SDK and permissions

| Capability            | Browser SDK                                        | Server rule                                           |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| viewer.progress.read  | `await forma.progress.read()`                      | Current viewer's state only                           |
| viewer.progress.write | `await forma.progress.write({page:2})`             | Current viewer; at most 20 bounded scalar fields      |
| contributions.read    | `await forma.contributions.list()`                 | This post's contributions                             |
| contributions.create  | `await forma.contributions.add({text:'A memory'})` | Owner or invited contributor; text max 500 characters |
| polls.read            | `await forma.poll.read()`                          | This post's aggregate counts and viewer choice        |
| polls.vote            | `await forma.poll.vote(0)`                         | Valid option; replaces current viewer's vote          |
| reactions.read        | `await forma.reactions.read()`                     | Preset options, counts, own choice, recent wall       |
| reactions.place       | `await forma.reactions.place("proud")`             | One preset sticker per viewer; `null` removes it      |
| plan.read             | `await forma.plan.read()`                          | Count, whether the viewer is in, visible names        |
| plan.join             | `await forma.plan.join(true)`                      | Adds or removes the current viewer only               |

Declare each capability used. A poll also requires `manifest.poll` with question and 2-6 option
labels. Writes are not inferred from read permission or vice versa. Preview uses separate state.
SDK calls reject with a code when permission fails; creator UI should catch and display the failure.

Draft metadata is separate: title, caption, format (`photo`, `scrapbook`, `story`, `collaborative`,
`custom`) and contributor IDs. Format is a feed label, not a restriction on source behavior.
The creator is always allowed to contribute when the capability is declared. Demo IDs are `you`,
`maya`, `leo`, `ines`. Public identity and contributor discovery need a separate production design.

## Versioning and concurrency

v1 packages with their original three capabilities remain accepted. v2 adds media, poll definitions,
poll capabilities, and reading contributions. Editing a draft requires its current revision. A stale
write or publish returns REVISION_CONFLICT. Repeating publish for the same revision returns the same
publication; publishing an edited revision creates a new post.

## Error and trace behavior

Responses include `error` and `traceId` on failure. Schema failures provide sanitized field paths and
messages, never raw submitted values. Logs contain trace ID, HTTP method, route pattern, status and
duration; they omit request bodies, actor identifiers, session credentials and runtime ticket URLs.

Common errors: UNAUTHENTICATED, NOT_FOUND (also used for foreign drafts), REVISION_CONFLICT,
CAPABILITY_DENIED, CONTRIBUTOR_REQUIRED, RUNTIME_EXPIRED, PREVIEW_STALE, ASSET_NOT_ACCESSIBLE,
INVALID_INPUT, INVALID_IMAGE, ORIGIN_DENIED, PAYLOAD_TOO_LARGE.

MCP tool arguments are constrained to known properties and validated again in the shared API/core.
See docs/mcp.md for tool names and workflow. The SDK does not expose credentials, direct database
queries, arbitrary target IDs or arbitrary network calls to post code.

## Profile v2: composition and Drawing Relay

Post package versions are unchanged; profile v1 stays accepted. Profile v2 adds `manifest.parts`:
an object with optional `profile`, `post`, `story`, and `feature` entries. Each entry is
`{name, entrypoint, capabilities}`. The entrypoint references a local HTML fragment (not index.html).
The shell in index.html includes matching markers such as `<!--forma:post-->`. Selected fragments
replace markers once, before local CSS/JS bundling. No recursive slot expansion occurs.

The top-level capability list must grant every selected part's requirements. All installed source
shares one iframe and these permissions, not separate per-mod permissions. Validate both the raw
package and assembled document. Profile v1 cannot declare relay capabilities or composition.

`POST /api/profile-drafts/:id/compose` accepts `{revision,slot,donor}` where donor is a v2 package
or null to remove the selected part. It saves a new owned draft revision; it does not publish.
Unselected parts remain. Conflicting source paths fail with PART_FILE_CONFLICT. Missing donor parts
fail with PART_NOT_PROVIDED. Preview and publish use the existing version/permission boundaries.
The editor exposes Raka and Essentials; import/MCP support original arbitrary HTML/CSS/JS packages.

- `relay.read`: `await forma.relay.read()` returns public contributions for this profile.
- `relay.add`: `await forma.relay.add({submissionId,strokes})` adds a public contribution.
- `submissionId`: UUID, reuse for retry; duplicate by another actor returns SUBMISSION_CONFLICT.
- `strokes`: 1–32 strict objects `{color,width,points}`. Color is six-digit hex, width 1–12,
  points 1–128 pairs of finite x (0–1000) and y (0–600). No actor, target or author fields accepted.
- Returns `{id,userId,name,createdAt,strokes}`; author fields come from the authenticated demo session.
- 200 contributions maximum, then RELAY_FULL. Concurrent additions append without replacing others.
- Published data is owner-bound and survives redesign/restoration. Preview is draft/revision-bound.
- Historical publication tickets cannot use relay methods disabled by the current profile.

Raka story highlights open published `story` posts; this is not an expiring-story backend. Post
parts control profile previews, not the independent published post's executable package or feed.
Per-part sandboxing remains future work. Optional bounded automatic height is described below. See ADR 0004.

Profile v2 may set `mobileHeight` (600–4000 CSS pixels). The host uses it at widths up to 600px
and in the explicit mobile preview. This is bounded declarative sizing, not automatic measurement.

## In-profile social controls (additive profile v2 extension)

Optional `profile.social.read` and `profile.social.toggle` grants let arbitrary profile parts render
live Follow, Like and Save controls. v1 remains unchanged and rejects these grants. Existing v2
packages need no migration. `forma.profile.social.read()` returns `{writable,ownProfile,following,
followers,posts:[{id,likes,liked,saved,comments}]}` scoped to this profile's publications. It exposes
only this visitor's relevant social selections, never a viewer ID or their wider saved/follow lists.
`forma.profile.social.toggle({action:'follow'})` targets the profile owner; actions `like` and `save`
require an owner-bound `postId`. Extra identity/target fields are rejected. Toggle returns the same
snapshot. Preview is read-only (`PREVIEW_READ_ONLY`); old publications recheck current grants.
Comments and options still open the host post dialog. Permissions are shared across installed parts;
these grants are not evidence of a human click. Production distribution needs a consent/abuse design.

Profile v2 `headerOverlay: true` optionally puts the host toolbar over the top 65px of the
profile artboard. Authors must leave that area clear of interactive content. The default keeps
the toolbar in normal flow; arbitrary packages are not forced into Raka's shell geometry.

## Explicit post covers (additive)

Post metadata accepts optional `coverAssetId: UUID`. It must be declared in a v2 post's
`manifest.assets` and pass the same owner/shared checks at create, update and publish. No cover
is inferred from the first asset: it may be decoration. Reuse copies/remaps the cover with media.
Old metadata without a cover remains valid; v1 post packages cannot declare covers.

Profile v2 adds optional `profile.cover` (seven possible grants). `forma.profile.cover(postId)`
returns `{src: dataURL, alt: postTitle}` or null. Only this profile owner's published posts qualify;
no arbitrary asset ID or private draft is accepted. Preview may read public covers. Historical
runtimes also require the active profile's grant. Legacy profile v1 capabilities are unchanged.
`profile.read` adds `hasCover`; it does not return media bytes. Consumers should fetch visible
covers lazily. Data URLs keep the sandbox's external networking restriction intact.

## Optional profile v2 content height

`manifest.autoHeight: true` opts into content sizing. Height/mobileHeight remain the loading
fallback. After ready, the host sends nonce-bound `forma:layout` with autoHeight true. The SDK
observes the body (flow layout, no viewport minimum height) and reports `forma:size` with an
integer height clamped to 600–4000. The host accepts only the current frame, opaque origin,
matching nonce, strict shape and bounded integer; updates are coalesced at 100 ms. This is a
layout hint, not a capability or access to host DOM. Content beyond 4000 still scrolls in-frame.
Viewport-height-based creator layouts should leave this option off to avoid resize feedback.
Legacy profiles and post runtimes ignore sizing messages.

## Feed windows (additive, ADR 0023)

In the feed every post shows a fixed 4:5 window. After ready, the host sends nonce-bound
`forma:layout` with `clip: true`; the SDK then sets `overflow: hidden` on the document, so the
frame never scrolls and a swipe or wheel over a post scrolls the feed. Content past the window is
seen with **Enter world** (full screen, unclipped). Pages should still design for any height
(`100vh` layouts fill the window); fixed-height pages show the runtime background below. Inner
scroll containers a page creates itself are not prevented. Full-screen posts, profiles and
previews are not clipped.

## Draft identity (additive; package versions unchanged)

Profile drafts and publications may include `identity: {name,bio,avatarAssetId}`. Name is trimmed,
1–80 characters; bio is trimmed, at most 300; avatarAssetId is a UUID or null (initials).
This strict object is outside the package manifest and cannot contain actor IDs, handles or grants.
New drafts snapshot the owner's current identity. Existing records without it remain valid.
`PUT /api/profile-drafts/:id` and MCP `update_profile_draft` accept optional identity alongside
package and revision; omission preserves the existing snapshot. Owned/shared image assets only.
Actor identity remains session-bound. Identity and package share a revision/concurrency boundary.

Draft `profile.read` returns the private snapshot only to its owner. Public reads return the current
account identity. Optional `owner.avatarSrc` is a data URL for that bound owner's avatar, not a
general asset reader. `GET /api/users/:id/avatar` serves only that user's current public avatar;
private draft selections do not become public through this route. Responses use no-store.
Publication commits the package, active pointer and account identity in one transaction. Restore
applies the selected publication's snapshot; legacy publications and null/default restoration leave
the account identity unchanged. Posts remain independently published content.

The visual composition helper is not a new package/runtime contract. For the compatible Raka shell
it writes bounded settings to `personal/design.js`, `personal/boot.js`, and `personal/design.css`,
and reorders the existing slot markers. It validates settings before writing source and never
evaluates imported settings. Mod fragments, permissions and custom source remain intact. Changes
to those generated files may be overwritten by the next visual edit; other source is preserved.
These controls do not imply universal compatibility, per-mod isolation, or a secure code validator.

## Local mod library (additive HTTP/MCP contract)

- `GET /api/mods`: latest metadata, author, selected slots, capabilities, declared asset count.
- `GET /api/mods/:id?version=N`: exact shared source version; omission selects the latest.
- `POST /api/mods`: strict `{submissionId,draftId,revision,name,description,slots,shareAssets:true,
thumbnailAssetId?,modId?,expectedVersion?}`. Names 1–80, descriptions 1–400, slots 1–4 unique
  existing v2 parts. Optional thumbnail is an owned/shared UUID or null. `modId` and expectedVersion
  are paired for owned updates; starter records cannot be updated by clients. Repeating the same
  submissionId/input by the same actor returns the same version; differing input conflicts.
- `POST /api/mods/:id/install`: strict `{version,draftId?,revision?,slot?}`. Without a draft, creates
  a private copy. Mixing requires all three optional fields and preserves other parts and identity.
  Source/asset/file-count/conflict checks apply. Failure creates neither assets nor draft changes.
- `GET /api/mods/:id/assets/:assetId?version=N`: only media included in that exact public mod version.

A shared record includes id, monotonic version, session-bound creatorId, name/description, slots,
createdAt, package and nullable thumbnailAssetId. Identity is not part of it. Sharing retains all
source/dependency files and declared design assets, including inactive dependencies; UI explicitly
discloses this. Private account avatar/post media are not inferred or copied. Owned included assets
are cloned with new UUIDs, and source references are remapped. Installing copies those assets again
for the installer; original private IDs never become generally readable. Immutable installs do not
auto-update. Library thumbnails can be chosen from owned/shared assets; generated graphic covers are
not screenshots. Built-in starter source changes advance its library version, never a live profile.

Partial package composition retains the existing shared-runtime contract. A fragment must load its
own CSS/JS dependencies or expect a compatible shell. Source path conflicts reject the operation;
the UI suggests a fresh draft or explicit source adjustment. No universal compatibility is claimed.

## Profile polls (additive v2 extension)

Optional `manifest.poll` is strict `{id,question,options:[{id,label}]}` and requires a feature part.
IDs match `[a-zA-Z0-9_-]{1,40}`, question 1–120 chars, 2–8 options with distinct IDs and 1–80 char
labels. `profile.poll.read` and `profile.poll.vote` grants require this definition; v2 now accepts
up to nine profile grants. v1 is unchanged. Composing the feature carries/removes its poll definition.

`forma.profile.poll.read()` accepts no payload. `.vote(optionId)` sends strict `{option}` only;
the actor/owner come from the ticket. Each actor can replace their one vote. Return value is
`{question,options:[{id,label,votes}],selected,total,preview}`, with no other voter identities.
Preview data is draft/revision-bound; public votes are owner/complete-definition-bound and capped
at 10,000 voters. Changed definitions start separate results. Removing or changing the active poll
denies historical access; restoring an unchanged definition restores its counts. Updates are
request/refresh based, not realtime. These are simulated accounts, not vote-fraud protection.

## Profile discovery and staged reuse (additive)

Draft/publication records may have server-managed `origins` keyed by profile/post/story/feature:
`{modId,version,modified}`. These are not package fields and cannot be submitted with draft writes.
Install records pin direct provenance; publication/restoration preserves the snapshot. Identity-only
edits preserve it. Source edits conservatively mark remaining credits modified; replacing/removing
part metadata clears that part's credit. Legacy/imported source has no inferred attribution.

- `GET /api/profiles/:id/mods`: active publication ID and four surface credits, including creator.
- `GET /api/mod-creators/:id`: public creator details, latest shared mods and distinct active profile
  counts. `forma` is the built-in collection. Historical publications and private drafts do not count.
- `POST /api/mods/:id/preview`: same strict input as install, but always creates a separate owned
  preview draft. A mixed preview records the original target ID/revision; it never changes that draft.
- `POST /api/mod-previews/:id/apply`: strict empty object; actor must own the unchanged preview.
  A target draft must still match its recorded revision. It receives the preview atomically; a new
  composition remains a separate private draft. Neither operation publishes a profile.
- `POST /api/profiles/:id/combination`: strict `{publicationId:UUID}` must match the current public
  pointer. Copies exact source and declared design media, remapping owned asset IDs, and preserves
  provenance. Identity, bio/avatar and public posts are the recipient's. Visitor state and
  private undeclared assets are not copied. Hardcoded source text/art is still design content.

Previews are retained as private drafts on cancel; practice state is draft/revision-bound. Credits
record direct installation lineage, not verified authorship, a license, transitive credit or proof
of unchanged dependencies. Undo via arbitrary source update follows the same conservative rules.
Existing MCP installation automatically records provenance; new discovery routes are HTTP/UI only.

## Reactions (additive, v2 posts)

`reactions.read` / `reactions.place` raise the v2 capability limit from 6 to 8. Options are chosen
by the host (moment template, or the owner's current decoration plus defaults), never by the
package, and visitors cannot submit text. Preview is read-only. Audience rules apply: a viewer who
cannot see the post gets `NOT_FOUND`. See ADR 0011.

## Themes (ADR 0022)

Themes are host catalog data (`decorations`, `themeEvents` in `contracts/src/identity.ts`), never
accepted from a client or package. `DecorationTier` is now `market | members | event` (was
`free | members | seasonal | sponsored`); `sponsor` is an optional label, and an event theme names
its event with `eventId` instead of `seasonId`. Every theme has a `font` from `themeFonts`. Stored
choices are ids only, so no stored data changes; a choice is re-checked against its lock on read.
Feed `PostDecor.decoration` gains `font` and, for event themes, `event` (the event's name).
`GET /api/users/:id/theme` returns `{ theme }` with the same shape, or `null`.
`GET /api/decorations` items gain `font`, `event` and `seasonal`.

## Community themes (additive, ADR 0024)

`OverlayPiece` is now a union: catalog pieces carry `svg` (trusted markup), community pieces carry
`html` and `css` instead and are only ever drawn as an image. Clients must not insert a piece's
`html` as markup. Approved community themes appear in `GET /api/decorations` items, in
`PostDecor.decoration` and in `GET /api/users/:id/theme` with the same fields as catalog themes;
their ids start with `t-`.

- `POST /api/themes/submissions` takes `themeSubmissionSchema` (`contracts/src/themes.ts`):
  `{ name, accent, font, kind, eventId?, orgId?, pieces }`. Each piece is
  `{ anchor, width, height, dx, dy, html, css }`, and must stay within the edge band. Unknown
  keys, including any creator field, are rejected. Returns the submission with
  `status: "pending"`. `THEME_QUEUE_FULL` (429) at 5 waiting submissions; rate limited per
  address.
- `GET /api/themes/submissions` lists the caller's own submissions, newest first, with `status`
  (`pending | approved | rejected | removed`) and the reviewer's `note`.
- `DELETE /api/themes/submissions/:id` removes the caller's own submission unless it is approved
  (`THEME_IN_MARKET`, 409).
- Moderators only (404 for everyone else): `GET /api/moderation/themes` lists waiting then
  approved themes; `POST /api/moderation/themes/:id` takes `{ decision: "approve" | "reject" |
"remove", note? }`. Approve and reject apply to waiting themes, remove to approved ones;
  anything else is `THEME_ALREADY_REVIEWED` (409).

## Trip places (additive, ADR 0026)

Travel chapters may carry `place` (a `PlaceId` from `places` in `contracts/src/identity.ts`, so
far only `bali`) next to `country`. `POST /api/identity/travel` adds a separate chapter, labelled
with the place's name, when the photo's position is inside a place of the photo's country. Trip
entries in `themeEvents` may name a `place`; such an event opens only with a chapter for that
place, while a country event opens with any chapter in that country, place or not. New event ids:
`trip-japan`, `trip-korea`, `trip-thailand` and `trip-bali`.

## Personal theme edits (additive, ADR 0025)

A community piece's HTML may mark editable text with `data-text="name"` (`[a-z][a-z0-9-]{0,23}`).
Community pieces in responses may carry `texts: { [name]: string }`; clients replace the text of
the matching elements with it as plain text, never as markup. `GET /api/decorations` items gain
`edit: { pieces: { dx, dy }[], texts } | null`, the caller's saved version.

- `POST /api/decorations/edit` takes `themeEditSchema`: `{ decorationId, pieces, texts }`. `pieces`
  has one `{ dx, dy }` per piece of the theme; every one must stay in the edge band. `texts` keys
  are `"<piece index>.<slot>"`, values 1 to 40 characters without control characters, and each
  must name a slot of that piece. `DECORATION_LOCKED` (403) for a theme the caller cannot wear,
  `THEME_EDIT_INVALID` (400) otherwise. Returns the same state as `GET /api/decorations`.
- `DELETE /api/decorations/edit/:id` drops the caller's version.

Edits apply only to their owner's profile, posts and theme lookups, and are re-checked against
the theme on every read: a theme whose pieces changed shows its original instead.

## Sides (additive, ADR 0027)

- **Catalog.** `sides` in `packages/contracts/src/sides.ts`: `{id, name, tagline, kind:
everyday|house|org, entry: open|invite, private, orgId?, accent, prompt}`. Everyday is the side
  everyone has.
- **Post metadata.** `metadata.side?: SideId` (`/^[a-z0-9-]{2,32}$/`); absent means Everyday.
  Set when the draft is created; publishing refuses `SIDE_UNKNOWN` (400) or `SIDE_NOT_JOINED`
  (403). A remix (`POST /api/posts/:id/reuse`) drops the side.
- **Bootstrap** carries `sides: {active, layout: separate|mixed, mine: Side[], open: Side[]}`
  (also `GET /api/sides`). Private sides appear only in `mine`.
- `GET /api/sides/:id/home` (ADR 0033) answers `SideHome`: `{side, member, since?, members:
{count, people: [{id,name,handle,initials,color,avatarAssetId?}]}, plans: SidePlan[], posts,
regulars: SideRegular[]}`.
  `people` are the newest members first, at most eight, minus people the viewer cannot see;
  `count` covers everyone. `plans` are the side's `plan.join` posts the viewer may open, newest
  first, at most three: `{postId,title,caption,ownerName,createdAt,count,cameCount,going,came}`.
  `regulars` (ADR 0034) are who came most often across those plans, most `came` first, at
  most five, only people who came at least once, minus people the viewer cannot see:
  `{id,name,handle,initials,color,avatarAssetId?,plans,came}`.
  A private side answers only to members; otherwise, and for an unknown side, `NOT_FOUND`.
- `POST /api/sides/active {side}` switches (members only, else `NOT_FOUND`);
  `POST /api/sides/layout {layout}`; `POST /api/sides/:id/join` (open public sides only;
  `SIDE_INVITE_ONLY` 403, private or unknown → `NOT_FOUND`); `POST /api/sides/:id/leave`
  (`SIDE_REQUIRED` 400 for Everyday). Each answers the sides view.
- `POST /api/posts/:id/share {everyday: boolean}` by the owner; `SIDE_ALREADY_EVERYDAY` 400 for
  a post that is in Everyday already.
- **Feed and explore** (`GET /api/feed`, `/api/explore`, and MCP `list_feed`) list the active
  side's posts, or every side you are in when the layout is mixed, plus posts shared to Everyday
  when Everyday is active. Each post may carry `side: {id, name, accent}` and `shared`.
- **Visibility.** A private side's posts are visible only to members (or when shared to
  Everyday), through the same `viewFilter` as blocks and private accounts: links, search,
  comments and profiles follow it. A public side's post opens by its link for anyone.
- Membership from an organisation's chapter (`invites/redeem`, `email/confirm`) is granted by
  the server in the same transaction; no request body names a side to join that way.

## Stamps and collections (additive, ADR 0028)

- **Catalog.** `collections` in `contracts/src/identity.ts`: `{id, name, orgId, side?, stamps:
{id, name}[]}`. `chapterKinds` gains `stamp`; a stamp chapter carries `collection` and `stamp`.
- `POST /api/identity/invites` accepts `kind: "stamp"` with `stamp: {collection, stamp}`
  (required for that kind, refused on others); the collection must belong to `orgId`
  (`STAMP_UNKNOWN` 400). `invites/redeem` refuses a stamp already held (`STAMP_ALREADY_HELD` 409) and otherwise adds the chapter and the organisation's side.
- `GET /api/identity/me` gains `collections` (as below, for yourself) and `issuable` (the
  collections your organisations issue stamps for). `GET /api/users/:id/collections` answers
  `[{id, name, org, side, held, total, stamps: [{id, name, held, label?, at?}]}]`, counting
  only the stamps the viewer may see (audience as for chapters).
- `ThemeEvent` gains kinds `stamp {collection, stamp}` and `collection {collection}`; the
  lock reason names the race or the count still missing.

## Plans (additive, ADR 0029)

- `plan.read` / `plan.join` raise the v2 capability limit from 8 to 10. `plan.read` answers
  `{count, cameCount, going, came, people: [{id, name, handle, initials, color, came}]}` (at
  most 40 names, newest first, only people the viewer may see); `plan.join {going?: boolean,
came?: boolean}` (at least one) records or removes the current viewer (`going`) and marks
  whether they were there (`came`, which implies being in; `going: false` drops both) and
  answers the same shape. Preview answers an empty list and refuses `plan.join`
  (`PREVIEW_READ_ONLY` 403). Deleting the post removes its records.
- The easy editor's `plan` style (`postDesignSchema.style`) is the only generated package that
  declares them; `buildPost` writes a fixed `plan.js` for it. The SDK exposes
  `forma.plan.read()`, `forma.plan.join(going)` and `forma.plan.came(came)`.

## Share cards (additive, ADR 0030)

- `GET /api/me/card?side=<id>` (default `everyday`) answers `image/svg+xml`, 1080×1350, with no
  external references; `NOT_FOUND` for a side you are not in or that does not exist.
  `GET /api/me/card/data` answers `{user, side, theme, stamps, path}`; `path` is
  `/u/<handle>?side=<id>` for an open public side, `/u/<handle>` otherwise.
- `GET /api/public/sides/:id` answers `{id, name, tagline, accent}` for a public side (guest
  rate limit); private sides are `NOT_FOUND`.
- `GET /api/public/sides/:id/home` (ADR 0035) answers `SideHome & {recent: [{id, title, caption,
hasCover, author}]}` for an open public side, as the guest viewer sees it (`member` false,
  no `since`, the same people and post rules as for a stranger); `recent` are the side's public
  posts, newest first, at most twelve. Private sides and Everyday are `NOT_FOUND`. The web app
  serves it at `/s/<id>`; a signed-in person opening that page is sent to `/?side=<id>`.
- Moments as gatherings (ADR 0036). `POST /api/gatherings` takes `GatheringInput` (`kind:
"wedding"`, `title`, `hosts?`, `date` as `YYYY-MM-DD`, `place`, `address?`, `note?`,
  `rundown?: [{time: "HH:MM", title}]` up to 20, `vendors?: [{role, name}]` up to 20) and answers
  `201 GatheringInvite`; at most 50 per host (`TOO_MANY_GATHERINGS`). `GET /api/gatherings` answers
  `GatheringSummary[]` (hosted and answered while signed in, soonest first).
  `GET /api/gatherings/:id/guests` answers `GatheringGuestList` to the host only (`NOT_HOST`);
  `DELETE /api/gatherings/:id` removes it and its answers.
- `GET /api/public/gatherings/:id` answers `GatheringInvite` to anyone (guest rate limit), with no
  answers in it. `POST /api/public/gatherings/:id/rsvp` takes `{name, phone, attending, guests?
(1-10), message?}` and answers `{name, attending, guests}`; 30 per 10 minutes per address. The
  phone is normalised (`0…` gets `62`) to 8-15 digits (`INVALID_PHONE`) and stored only as a hash
  per gathering plus its last three digits; the same number again replaces its answer; past 3000
  answers new ones are `GATHERING_FULL`. The web app serves the invite at `/m/<id>`, the host's
  list at `/m/<id>/guests`, and your moments at `/m`.
- The moment group (ADR 0037), members only (`NOT_FOUND` to anyone else). `GET
/api/gatherings/:id/space` answers `GatheringSpace` (`invite`, `me`, `role`, `mode`, `members`,
  the viewer's `groups`); `POST /api/gatherings/:id/join` joins from the link. `POST
/api/gatherings/:id/mode` takes `{mode: "announce" | "open"}` from the host (`NOT_HOST`). `GET
/api/gatherings/:id/messages?group=` answers the last 200 `GatheringMessageView`s of the main chat
  or a small group; `POST` the same path takes `{text, group?}` (60 a minute per address;
  `ANNOUNCEMENTS_ONLY` for a member in announce mode; small groups always free). `POST
/api/gatherings/:id/groups` takes `{name, members}` of moment members (`NOT_A_MEMBER`) and answers
  the space; `POST /api/gatherings/:id/groups/:group/leave` leaves it, and the last one out removes
  it. Small groups are hidden from everyone outside them, the host included.
- The app reads `?side=<id>` on `/` and `/u/<handle>`: a signed-in member is switched to the
  side (joining first when it is open); a guest sees the side named on the public page.
- Search (the Posts tab) lists the sides in `SidesView` (`mine` and `open`, never Everyday)
  whose name or tagline contains every word of the query, above the posts.

## Gift themes (additive, ADR 0031)

- `POST /api/decorations/gift {toId, decorationId, note ≤140}` by the giver. `GIFT_SELF` 400,
  `GIFT_NOT_MARKET` 400 for an unknown, `members` or `event` theme, `INVALID_USER` for an
  unknown receiver, and the block rule applies. Answers `{id}` and notifies the receiver
  (`NotificationType` gains `gift`).
- `GET /api/decorations` gains `gifts: [{id, decoration: {id, name, accent}, from: {id, name,
handle}, note, at}]`, newest first, for the caller as receiver.

## Post buttons (additive)

Post metadata accepts an optional `link: { label, url? }`. `label` is 1 to 32 characters and is the
text of a button shown under the post. Without `url`, the button opens the post's own page full
size in the in-app page sheet. With `url`, it opens that page in the sheet in a sandboxed frame
(no top navigation, no referrer) with an **Open in browser** fallback, because many sites refuse
to be framed and the app cannot detect that reliably. `url` must be an absolute `https:` URL of at
most 500 characters with no username or password; `javascript:`, `data:` and plain `http:` are
rejected. Unknown keys are rejected. Old metadata without `link` stays valid, and reusing a post's
format carries the button over with the rest of the metadata.

## The Wall and easy editing (additive, profile v2)

Three profile methods let a page keep a guestbook. Each needs its manifest grant and, outside a
draft preview, the owner's current publication must still grant it (like the relay).

- `forma.profile.wall.read()` → `{ notes, total }`, newest first, at most 60. Each note is
  `{ id, userId, name, text, tone, createdAt, removable }`; `removable` is true for its author and
  for the profile owner.
- `forma.profile.wall.add({ submissionId, text, tone })`: `text` 1–140 characters, `tone` 0–3.
  The author and name come from the session, never the frame. A repeated `submissionId` from the
  same person returns the wall unchanged; from someone else it is `SUBMISSION_CONFLICT`. Limits:
  200 notes per wall (`WALL_FULL`), five per person (`WALL_NOTE_LIMIT`). Blocked or suspended
  accounts are refused. Returns the same shape as `read`.
- `forma.profile.wall.remove(noteId)`: the author or the owner only (`FORBIDDEN` otherwise).
- `forma.profile.wall.report(noteId, reason?)`, `reason` one of `spam`, `harassment`, `other`
  (default). It needs no grant of its own: a page granted `profile.wall.read` can always report,
  so existing walls get it without republishing their manifest. Notes carry `reportable` (not your
  own, not on a draft). A reported note is hidden for the reporter at once and queued for
  moderators as target `wall-note` with id `ownerId:noteId`; `remove` takes it off the wall,
  `dismiss` keeps it. Your own note gives `CANNOT_REPORT_OWN_NOTE`; draft walls can't be reported.

A draft preview has its own wall, kept per draft, so trying a page never writes on the live one.
Deleting an account removes its notes everywhere and its own wall.

Edit mode, for owner draft previews only: the host may send
`{ type: "forma:editing", nonce, on: boolean }`. The SDK then sets `html[data-editing="on"]` and
dispatches a `forma:editing` event. While it is on, `forma.edit.select(field)` posts
`{ type: "forma:edit", nonce, field }`, where `field` matches `^[a-z][a-z0-9-]{0,30}$`. The host
ignores it unless the frame is a draft preview that it put in edit mode. `forma.edit.active`
reports the state. No server call is involved. While edit mode is on, the SDK itself turns any
click into an edit: it cancels the click and, if it landed inside an element with a `data-edit`
attribute, selects that field. It also outlines `[data-edit]` elements with a zero-specificity
default style that page styles can override.

The Room and Comic vibes keep easy choices in a marked block at the top of `index.html`
(`<!-- smudge-look:start -->` … `<!-- smudge-look:end -->`, `window.smudgeLook = {tint, line}`),
validated by `lookSettingsSchema` in `packages/core/src/easy-look.ts`. Ink & Paper and Essentials
keep using `personal/design.js`; its generated boot script now tags their parts with `data-edit`.

The Smudge Paint wall stores easy-editor choices in an ordinary file, `smudge/settings.js`
(`window.smudgeSettings = {…};`), validated by `smudgeSettingsSchema` in
`packages/core/src/smudge-design.ts`. Writing it adds the Wall grants only while the Wall section
is shown.

## Website import (additive)

Post metadata accepts an optional `source: { url, host }`: where an imported page came from.
`url` is an absolute `http:` or `https:` URL of at most 500 characters with no username or
password; `host` is 1 to 120 characters. It is shown under the post in the page sheet as
"Imported from {host} · Visit original site", opening in a new tab with
`rel="noopener noreferrer"`. It is the importer's claim, not a verified fact. Old metadata without
it stays valid.

`POST /api/imports` (signed in; 20 per 10 minutes per client) takes
`{ url, permission: true }` and returns `{ page, found: { words, photos, photosKept, products } }`.
A missing scheme means `https://`. It reads one page and stores nothing but photos; it never
publishes. `page` matches `importedPageSchema` in `packages/core/src/site-import.ts` and is turned
into an ordinary v2 post package (`index.html` + `page.css`, no script) by `buildImportedPage`,
which the client sends through the normal draft routes. Every string is escaped; nothing from the
site's markup is copied.

Fetch rules (`apps/server/site-fetch.ts`): `https:` only on port 443; no credentials in the URL;
every DNS answer must be a public address (private, loopback, link-local, CGNAT, multicast,
documentation, ULA and IPv4-mapped forms are refused) and the connection goes to exactly the
address that was checked; at most three redirects, each checked again; 8 seconds and 2 MB for the
page. Photos: JPEG, PNG, WebP, GIF or AVIF up to 6 MB, at least 120 px, re-encoded with sharp to
WebP (at most 1200×1600, 900 KB, first frame only, metadata dropped), at most 12, saved as the
person's own assets. Errors are `422` with codes `SITE_URL_INVALID`, `SITE_NEEDS_HTTPS`,
`SITE_NOT_ALLOWED`, `SITE_NOT_FOUND`, `SITE_REFUSED`, `SITE_UNREACHABLE`, `SITE_TOO_SLOW`,
`SITE_TOO_LARGE`, `SITE_NOT_A_PAGE`, `SITE_TOO_MANY_REDIRECTS` and `SITE_EMPTY`.

`FORMA_IMPORT_ALLOW_HOSTS` (comma-separated `host:port`) lets a local trial read those hosts over
plain `http:` despite the rules above. It is ignored in production.

## Easy posts (additive)

Posts made in the easy post editor keep their settings in `smudge/post.js`
(`window.smudgePost = {…};`), validated by `postDesignSchema` in `packages/core/src/easy-post.ts`:
`style` (`poster`, `magazine`, `gallery`, `scrapbook`, `note`, `plan`), `palette`, `font`, `kicker` (≤40),
`headline` (1–90, `*stars*` make italics), `text` (≤1500, blank lines split paragraphs), `quote`
(≤200), `photos` (≤12 of `{ assetId, caption ≤120 }`) and `motion`. `buildPost` regenerates
`index.html`, `post.css` and, with motion on, a fixed `motion.js` (and `video.js`, see Videos
and Explore); every string is escaped and no other script is written. A package without a valid settings file is an ordinary post and opens in
the studio. Title, cover and format follow the design; caption and button stay the editor's.

Edit mode (see The Wall and easy editing) now also applies to post draft previews: the host may
put a post draft preview in edit mode and accepts `forma:edit` only from such a frame. Easy posts
tag `kicker`, `headline`, `text`, `quote`, `photos` and `photo-N`.

## Editing, deleting, replies, mentions and share links (additive)

- **Editing.** `POST /api/posts/:id/edit` (owner only, body `{}`) returns the post's source draft,
  or creates one from the published package and links it. Publishing a draft that already has a
  post now **updates that post in place**: same id, `createdAt`, likes, comments and feed position;
  `package`, `metadata`, `revision` and `digest` change and `editedAt` is set. Publishing the same
  revision twice is still a no-op. Moments refuse with `MOMENT_NOT_EDITABLE`. `PostView` gains
  `revision` and optional `editedAt`; the web runtime reloads when `revision` changes.
- **Deleting.** `DELETE /api/posts/:id` (owner only, else `FORBIDDEN`, or `NOT_FOUND` when the post
  is not visible) removes the post with its likes, saves, reports, progress, votes, comments,
  contributions, reactions, moment record, notifications and moderation record. The draft and the
  uploaded photos stay with the owner.
- **Replies.** `POST /api/posts/:id/comments` accepts `{ text, parentId? }`. Replies are one level
  deep: answering a reply attaches to its top-level comment. Comments carry `parentId` when they
  are replies. `DELETE /api/comments/:id` is allowed for the comment's author and the post owner,
  and removes its replies too.
- **Mentions.** `@handle` (3–24 of `a-z0-9._`, trailing dots ignored, first ten per text) in a
  comment or a post caption notifies that person, if they exist, can see the post and nobody is
  blocked. Editing a caption only notifies newly named people; people already notified about a
  comment (post owner, person answered) are not notified twice. New notification types: `reply`,
  `mention`.
- **Share links** need no account. `/p/:postId` and `/u/:handle` in the web app read
  `GET /api/public/posts/:id`, `GET /api/public/posts/:id/cover` and `GET /api/public/users/:handle`
  (rate limited per client). Guests see what a stranger would: no removed posts, circle-only or
  moment posts, or suspended and deleted people; comments by hidden people are left out.
  `POST /api/public/runtime { target, kind }` issues a guest ticket (10 minutes, a separate pool of
  300). Guest posts get no capabilities. Guest profiles get read-only ones through
  `POST /api/public/capability`: `profile.read`, `profile.openPost`, `profile.cover`,
  `profile.social.read` (nothing liked or followed), `relay.read` and `profile.wall.read`
  (nothing removable or reportable); anything else answers `SIGN_IN_REQUIRED`. A guest ticket is
  never accepted by `/api/capability`. Avatars of visible people are served without a session.
  Signed-in people opening a share link are sent to the post (`/?post=id`) or profile in the app.

## Videos and Explore (additive)

- **Video upload.** `POST /api/videos` takes the raw file as the body (`Content-Type`
  `video/mp4`, `video/webm` or `video/quicktime`, optional URL-encoded `X-File-Name`), up to
  30 MB, 20 uploads per 10 minutes per client. The first bytes must look like MP4/MOV (`ftyp`) or
  WebM (EBML). It answers `{ id, name, mime }`; the id is an ordinary asset id (same ownership,
  visibility and `manifest.assets` rules as photos). Errors: `INVALID_VIDEO`, `VIDEO_TOO_LARGE`,
  `PAYLOAD_TOO_LARGE`. The bytes are stored as a file under `<data dir>/media/`, not in the
  record store.
- **Playback.** In a runtime document, `asset:ID` for a video becomes
  `<runtime origin>/media/<ticket>/<ID>`, which streams with range requests while the ticket is
  valid and only for assets the ticket's package declares. The runtime CSP adds the runtime
  origin to `media-src`. `GET /api/assets/:id` streams videos too. Reusing a format copies videos
  into the new owner's assets, as with photos.
- **Covers are images.** A `coverAssetId` must be an image (`COVER_NOT_IMAGE`).
- **Easy posts.** A photo entry may carry `videoAssetId`; its `assetId` is then the poster frame
  (and can be the cover). The video plays with controls in place of the photo; in the Poster hero
  it loops silently behind the words and a tap pauses it, via a fixed `video.js` that is only
  added when such a video exists and does not autoplay for reduced-motion viewers. The editor
  grabs the poster frame in the browser, which also refuses files the browser can't play, and
  limits videos to 3 minutes.
- **Explore.** `GET /api/explore` returns up to 60 decorated posts from people you don't follow
  (and not yours), scored by `(1 + likes + 2 × comments)` fading with age over about a week.
  `GET /api/explore?q=…` (≤60 characters) returns visible posts whose title, caption, author name
  or handle contain every word (a leading `@` or `#` is ignored). Moments never appear in either.

## Private accounts and group chats (additive)

- **Private accounts.** `POST /api/account/privacy {private: boolean}` sets the flag on the
  user record (`User.private`). A private account's posts, moments and comments on them are
  visible only to the owner and accepted followers: the privacy filter sits in the same
  `viewFilter` chain as blocks and moderation, so the feed, Explore, search, share links
  (`/api/public/*`), profiles, mentions and notifications all follow it. The profile itself
  (name, bio, profile page) stays visible. Going public accepts every waiting request.
- **Follow requests.** `POST /api/users/:id/follow` on a private account the viewer doesn't follow
  toggles a request and answers `{active: false, requested}`; the owner gets a `follow-request`
  notification. `GET /api/follow-requests` lists `{user, createdAt}`;
  `POST /api/follow-requests/:userId {accept}` accepts (a `follow-accepted` notification) or
  declines; `DELETE /api/followers/:userId` removes a follower. Bootstrap has `requested`
  (ids you asked), `PersonView` has `requested` and `private`, and `profile.social.read` returns
  `requested`. Blocking or deleting an account clears requests both ways.
- **Groups.** `POST /api/groups {name (1–60), members (2–31 ids)}` creates a group owned by the
  caller; every member must be someone the caller could message one to one
  (`MEMBER_NOT_ALLOWED`; `GROUP_TOO_SMALL`). `GET /api/groups` lists the caller's groups with
  `last`, `unread` and `updatedAt`; `GET /api/groups/candidates` lists who can be added.
  `GET /api/groups/:id` returns `{id, name, owner, members, messages}` and marks it read;
  non-members get `NOT_FOUND`. `POST /api/groups/:id/messages {text}` shares the 30-per-minute
  message limit. `POST /api/groups/:id/members {userId}` (any member, for people they could
  message; at most 32 members, `GROUP_FULL`), `DELETE /api/groups/:id/members/:userId` (yourself,
  or the owner removing others; ownership passes to the longest member and the last one out
  deletes the group), `POST /api/groups/:id/name {name}` (owner only). Messages from people you
  blocked or who blocked you are hidden from you. Group unread counts are part of the messages
  badge. Deleting an account removes its group messages and seats.
