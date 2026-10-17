# Architecture and trust boundaries

## Running system

```text
Browser -> Next.js :3000 -> /api rewrite -> Express API :3001
External AI -> stdio MCP -> local bearer -> Express API :3001
                                               |
                                         SocialService
                                               |
                                     Single-writer SQL.js SQLite

Browser feed -> sandbox iframe :3002 -> SDK messages -> host bridge -> API capabilities
```

`scripts/dev.mjs` starts Next and one backend process, which owns both Express listeners and
the database. All listeners bind to 127.0.0.1. Local stdio MCP forwards HTTP to this process;
it never opens a second database connection/file writer.
The API's 60-second keep-alive timeout outlives Node's five-second client pool idle timeout.
Equal defaults caused intermittent `ECONNRESET` on Next's reused upstream sockets, including
profile-history reads immediately after publication. A pooled-connection regression crosses
the old five-second close boundary; headers remain bounded to 65 seconds.

## Module map

- `packages/core/src/profiles.ts`: shared draft ownership, publication history, active pointer,
  restore concurrency and owner-bound public-data/navigation capabilities.
- `packages/contracts/src/profile.ts`: separate profile v1 contract; adapts only validated source
  files/media to the existing renderer, without inheriting post capabilities.
- `apps/web/components/profile-page.tsx`: public profile controls and package editor, desktop/mobile
  visitor preview, import, publish and restoration. Opened posts retain their own runtime tickets.
- `apps/server/profiles/*.html`, `seed-profiles.ts`: ordinary room/comic profile packages, seeded
  once for Maya and Leo. Existing edited/published profiles are never replaced on startup.

- `breakout-feed.tsx`, `app/breakout.css`: host-authored vertical overlap experiment. Each post
  reserves normal flow height while a clipped absolute extension envelope overlaps adjacent posts.
  Sibling frames and art share a stacking context; decoration uses pointer-events:none, with only
  explicit buttons accepting input. Social controls sit above decorative layers. Scroll parallax
  is bounded to 22px and disabled for reduced motion. No package permissions or runtime boundary
  changes are involved; this does not yet expose arbitrary creator HTML outside its iframe.

- `apps/web/components/forma-app.tsx`: navigation, feed state, demo account switching.
- `post-card.tsx`, `studio.tsx`, `ui.tsx`: social actions, authoring, shared dialog/avatar UI.
- `runtime.tsx`: viewport lifecycle, frame identity validation, typed request forwarding.
- `theme-toggle.tsx`, `app/worlds.css`: persisted/system appearance and full-width feed layout.
- `theme-piece.tsx`, `theme-studio.tsx`: community theme pieces are a designer's HTML and CSS,
  turned into an SVG `foreignObject` image and shown as `<img>`, never inserted as markup; the
  browser's image isolation (no scripts, no outside loads, no input) is the boundary. The studio
  and the moderators' review queue live here; rules and storage are in `packages/core/src/themes.ts`
  (ADR 0024).
- `decorations-panel.tsx`, `theme-editor.tsx`: the Themes gallery, the preview of yourself in a
  theme, and the personal editor (drag pieces within the edge band, rewrite `data-text` slots).
  The edit is stored and re-checked against the theme in `packages/core/src/identity.ts` (ADR 0025).
- `cockpit.tsx`, `app/cockpit.css`: optional whole-screen spatial feed navigation. Uses the same
  posts and social API, opens existing isolated Runtime instances, and scopes its CSS to the mode.
  The cockpit is trusted host code; no post receives access to navigation or host DOM. Its dark
  palette is local to the cockpit and does not overwrite the viewer's stored appearance choice.
- `apps/server/index.ts`: host/origin checks, sessions, transport validation, trace IDs, runtime tickets.
- `apps/server/seed.ts`: synthetic accounts and four example experiences.
- `seed-worlds.ts`, `worlds/*.html`: three additional programmable worlds, seeded once without
  replacing existing publications or user state. Editing seed source does not update published snapshots.
- `packages/core/src/social.ts`: domain rules shared by browser and MCP.
- `database.ts`: synchronous single-writer transactions and atomic SQLite file replacement.
- `packages/contracts/src/experience.ts`: additive v2 plus accepted v1 contracts.
- `packages/runtime/src/document.ts`: bundles package files/media into an isolated document.
- `packages/post-sdk/src/source.ts`: `window.forma` promise-based capability client.
- `apps/mcp/index.ts`: official SDK, explicit tool schemas, stdio transport, API forwarding.
- `packages/core/src/index.ts`: original in-memory v1 demonstration only; not used by HTTP/MCP.

## Data and publication

Profiles use separate `profile-draft`, `profile-publication`, `profile-state` and `profile-report`
record kinds in the existing store. No destructive database migration is needed. The active state
has a monotonic version so restoring or publishing from another editor invalidates stale writes.
Published historical profile revisions remain readable via tickets; restoration is not a deletion
or revocation mechanism. Reports are local records, not a moderation workflow.

SQLite stores typed JSON records under `(kind, id)` and a migration version. This intentionally
small demo uses full-file export after writes. Publication validates ownership, expected revision,
package shape and asset permissions before storing an immutable snapshot. The same draft/revision
publishes once; a later draft revision produces a new post rather than modifying old viewers' data.

The package digest includes source and manifest with stable object-key ordering. It is a content
identifier, not a signature or proof of safety. Reuse creates a new draft; private media references
from the original published package are copied into the new author's namespace where necessary.

Progress and votes are keyed by post and viewer. Contributions are keyed by post and only accepted
from the owner or metadata contributor list. Preview data uses a separate draft/revision namespace,
so preview interactions never leak into a published post.

## Identity

The browser gets an opaque HttpOnly SameSite=Strict session (`Secure` on https). Sessions are
created by email + password signup/login (`packages/core/src/accounts.ts`), stored as hashes in the
database and survive restarts; business payloads cannot set Actor. In demo mode a dedicated
simulation endpoint additionally selects one seeded account and a first visit is signed in as Alex;
production disables both (ADR 0012). Signing in, out or switching revokes the old session's
runtime tickets. Configuration and modes: `apps/server/config.ts`; deployment: `docs/deploy.md`.
Google login (`apps/server/google.ts`, PKCE) ends in the same stored session; accounts link only
through a confirmed email.

Community rules live in `packages/core/src/community.ts` (blocks, notifications, people search,
reports and moderation, suspension, deletion) and `packages/core/src/messages.ts` (direct
messages). Community installs one visibility filter and relation guard on the social service, so
every read path hides removed posts and blocked, suspended or deleted people the same way.
Social actions emit events inside their transaction; notifications are written from those
events. HTTP: `apps/server/community-routes.ts`. Decision: ADR 0013.

MCP reads a local credential file. In demo mode it always resolves to Alex (`you`), independent of
the browser account; production ignores it. There is no OAuth or per-tool scope system.

## Runtime boundary

1. The host requests a runtime ticket for a post or owned draft. It binds user, browser session,
   target, draft revision, preview flag, nonce and expiration (30 minutes).
2. A separate-origin iframe loads the ticket URL with `sandbox="allow-scripts allow-forms"`.
   It has an opaque origin; `allow-same-origin`, top navigation, popups and downloads are absent.
3. Server CSP forbids external fetches, subframes, workers, objects, base URLs and form submissions.
   Forms may dispatch JS events; `form-action 'none'` prevents native submission.
   Inline creator scripts/styles and embedded image/media data are allowed. Eval is not allowed.
4. The host accepts only messages from the exact frame window, with null origin, current nonce,
   and validated request shape. It binds requests to its ticket; post code cannot supply a target
   or actor. A small client-side rate guard limits accidental message floods.
5. The server checks session, ticket expiry, preview revision, capability declaration and resource
   permission for every request. A capability name is not sufficient authorization by itself.
6. Offscreen iframes are removed. Errors and load timeouts show host-owned retry/skip controls.

Published and preview content use the same renderer and isolation policy. The parent chrome is
outside creator control. The source tree is not mounted into the runtime server.

An optional validated stage manifest supplies bounded height and day/night colors for host chrome.
The host observes its appearance and sends the theme to mounted frames, including on readiness.
The SDK validates parent and nonce before updating the creator document. No new data permission
or sandbox privilege is granted. Explicit theme choice persists in localStorage; otherwise the
host follows the system preference, with an initial head script to avoid a light first paint.

## Operational limits

An iframe is not a hard CPU/memory boundary; a hostile loop may hang rendering. Self-navigation
cannot be comprehensively prevented by the implemented browser policy. Local origin isolation is
not a claim of complete adversarial containment. Untrusted public authors need further threat review.

The store rewrites a file and has no distributed locking, power-loss durability guarantee, indexing
strategy or large-library scalability claim. The local lock guards concurrent owners; any server
database migration must replace this design deliberately. Runtime tickets are ephemeral; auth
rate limits are in memory. There is no moderation service, OAuth, telemetry backend, or video pipeline.

See ADR 0002 for tradeoffs and the debugging runbook for reproduction paths.

## Modular profile and relay boundary

Profile v2 assembly lives in contracts/profile.ts; pure composition rules live in core/composition.ts.
core/profiles.ts owns capability-gated `profile-relay` records. Profile owner keys preserve published
contributions across themes; preview keys include draft/revision. Historical ticket calls recheck
current relay grants. No actor is accepted from package input. The SDK exposes relay.read/add
and the optional social methods described below.
Raka source lives under apps/server/profiles/raka and is seeded as an ordinary editable package.
The additional Raka demo account and posts use a separate seed marker without resetting existing data.
See ADR 0004 for shared-sandbox, file collision, storage and compatibility limitations.

Raka's visual atlas is seeded as a shared image asset before checking the existing seed marker.
The profile shell defines one SVG image and explicitly clipped regions reused by fragments. This
avoids embedding the same PNG for every illustration and prevents neighboring atlas cells bleeding
into differently shaped viewports. `scripts/refresh-raka.ts` is an explicit local demo publishing
command; normal startup never replaces an active customized profile. Relay storage is unchanged.

Profile runtimes stay mounted while their profile/editor page is open, including viewport changes
and editor scrolling, so in-progress drawing is not discarded. Feed post runtimes still unmount
when offscreen. Navigating away or switching the selected profile revision replaces the runtime.

Profile social controls use optional v2 read/toggle grants, owner-bound core validation and current
publication grant checks; see ADR 0005. Host data refresh follows successful in-profile mutations.

The profile editor now includes surface tabs, illustrative layout choices, automatic preview for
v2 drafts, an explicit copy of the live package, read-only live comparison and single-step part undo.
It uses existing revision-checked draft/update/compose endpoints; no package contract changed.

The Photo stack example is a standalone, post-only v2 donor with namespaced source and styles.
It uses existing profile read/openPost/social grants, without a new contract or shared Raka CSS
changes. This allows composition into existing publications without colliding with their files.
Dense cockpit libraries (>8 posts) use a scrollable strip to avoid overlapping pointer targets.

Profile v2 may opt into bounded automatic content height. The SDK observes body flow size;
the host accepts only strict, finite 600–4000 px messages from the current opaque iframe and
nonce, and coalesces updates. Height fields remain loading fallbacks. Other packages retain
fixed sizing. The host reserves space for its bottom navigation separately from the creator's
content. See ADR 0007 and the contract for limits and viewport-dependent layouts.

Raka's responsive composition is maintained in `apps/server/profiles/raka/reference.css`, separate
from the generic fragment styles. At phone widths the live profile, highlights and relay reflow;
text and touch controls retain readable sizes, while published posts keep two columns. Relay
coordinates remain 1000×600 across layouts, so resizing does not rewrite saved contributions.
The final exploration strip clips its source SVG to exclude baked-in mockup controls.

Profile identity editing is a private draft snapshot outside creator packages. `ProfileService`
validates name/bio/avatar ownership and commits identity plus publication state atomically. Runtime
preview reads that snapshot; public reads use the account's published identity. The host avatar
route exposes only the current public reference, with no-store caching. Old records are compatible.

`packages/core/src/profile-design.ts` is a pure, validated source generator for Raka's layered shell.
The React personalizer holds unsaved form state and submits identity plus generated package in one
revision-checked update. It does not add a runtime dependency or restrict imported HTML/CSS/JS.
Original fragments stay intact, so bundled parts remain composable and old Raka copies can opt in.
The source editor remains available; only the three generated personal files are rewritten by
visual edits. Photo creation in the editor uses the existing asset/draft/publication endpoints and
explicitly publishes separately. See ADR 0008 for identity compatibility and publication semantics.

`ModService` owns shared-library publication and installation. `mod` is the latest pointer/summary,
`mod-version` stores immutable source snapshots, `mod-submission` binds retry IDs to an actor and
input digest, and `mod-install` records the pinned source version/draft revision. Sharing clones
owned declared media into a mod-version namespace. Installing clones that media into the installer
namespace; shared seed artwork can retain its IDs. Validation/composition happens before one atomic
asset-and-draft commit, so failed mixes leave no media behind. Identity and visitor state are never
copied. The scoped mod asset route exposes only assets explicitly included in that version.

Profile polls use `profile-poll` records keyed by owner plus the complete poll-definition hash;
preview keys include draft/revision. Only aggregates and the current visitor's selection leave the
domain. Historical tickets must match the active definition and grant. The example music fragments
load their own scoped styles and use the SDK directly; their shell retains shared artwork/boot
helpers for mixing existing Raka parts. Generic fragment compatibility still requires author work.
See ADR 0009 for distribution and poll boundaries.

Discovery uses server-managed draft/publication `origins`, not untrusted manifest claims.
`ModService` resolves credits through immutable editions and computes usage from active profile
pointers. `mod-preview` binds a candidate revision to an optional target revision; apply rejects
stale candidates/targets. Preview assets and source commit together without changing the target.
Copying a public combination requires its active publication ID and remaps only declared design
assets. Identity and interaction state remain recipient-bound. See ADR 0010.
