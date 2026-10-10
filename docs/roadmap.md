# Local demo status and next steps

## Implemented

- [x] Local versioned mod library, source/asset sharing, complete or partial installs, part mixing,
      owned version updates, covers, private preview, undo, and matching MCP tools.
- [x] After Hours music zine with vinyl identity, poster posts, ticket highlights and persistent
      owner-bound setlist polls; practice votes and changed definitions are isolated.

- [x] Personal profile authoring from Raka: private identity/avatar edits, source-generating
      composition controls, part mixing, undo, preview, independent photo creation and atomic publish.

- [x] Public profiles as isolated HTML/CSS/JS packages, editor/import, desktop/mobile visitor preview,
      owner data and real post navigation, follow/report, reduced motion, publish/restore and MCP.

- [x] Vertical breakout prototype with clipped inter-post overlaps, click-through decoration,
      bounded parallax, boundary inspection, mobile layout and actual post actions.

- [x] Optional cockpit experiment: draggable/keyboard orbit, real post holograms, comments,
      likes, saves, responsive layout and reduced-motion support.

- [x] Responsive feed, profiles, follow, search, format filters, likes, comments and saved posts.
- [x] Photo, scrapbook, branching story/poll and collaborative example formats in one feed.
- [x] Full-width creator worlds: draggable keepsakes, interactive constellation and unfolding letter.
- [x] Persistent day/night mode, system preference and live appearance delivery to creator code.
- [x] Separate-origin sandbox runtime, capability bridge, offscreen unloading, error/timeout UI.
- [x] Progress, voting and contribution handlers with viewer/contributor permissions.
- [x] Local SQLite persistence, image storage, simulated accounts and revisioned publications.
- [x] Studio with source editing, import, photo upload, preview, format reuse and publish.
- [x] Official SDK stdio MCP tools for specification/media/draft/preview/publication.
- [x] Core regression suite and real browser/MCP E2E coverage in repository.
- [x] Updated setup, contracts, architecture, decisions and debugging documentation.

The UI is usable without connecting an AI. The MCP E2E scenario authors a pocket observatory with
custom stateful behavior, distinct from the seeded formats. External AI client setup is documented;
the application does not include or automatically connect a hosted model.

## Explicit local-demo limits

- Profiles use bounded iframe heights, with optional content sizing up to 4000px and internal
  scrolling for larger documents. Visual controls currently support the Raka shell and compatible
  parts; arbitrary imported mods use source/MCP for their own structure and behavior.
  Reduced motion is enforced for ordinary CSS through the SDK; arbitrary JS authors must cooperate.
  Local profile reporting is stored only. Personal customization of the entire app remains future work.

- Breakout artwork is host-authored. Programmable cross-post extension manifests, anchors and
  isolated hit-testing for arbitrary creator layers are not implemented yet.

- The cockpit is a built-in whole-app composition experiment. External AI can author post
  experiences; an extensible application-shell contract and large-feed spatial navigation remain future work.

- Simulated accounts, not public authentication or remote OAuth.
- Creator code must provide its own night styling; older packages can keep their original palette.
- JPEG/PNG/WebP photo upload only; no video upload/transcoding or audio controls.
- No hard CPU/memory containment for adversarial custom code.
- Small single-process SQLite store; no production throughput claim or large-media optimization.
- Local report records only; no moderation dashboard or automated abuse handling.
- Local screenshots and Chromium tests; no claim of cross-browser, physical-device, or accessibility audit.
- No cloud deployment, advertising, marketplace, arbitrary backend code, or user-defined dependencies.

## Before public deployment

1. Review runtime threats including denial of service, self-navigation and exfiltration scenarios.
2. Real identity, resource authorization, MCP OAuth/scopes, session lifecycle and rate limits.
3. Durable database schema/indexes, migrations, backup/restore drill and concurrent publishing tests.
4. Media processing, quotas, moderation, deletion and retention.
5. Device performance budgets, accessibility testing, runtime compatibility and controlled rollout.
6. Deployment artifact identifiers, package-disable tools, observability and rollback runbooks.
7. Estimate costs from measured traffic and storage before choosing paid infrastructure.

Community/chat, games and marketplace expansion remain separate product decisions.

## Modular profile milestone

Implemented: one English Raka profile with comic geometry and bounded visual overlap; profile v2
fragments; partial package composition in editor/API/MCP; Essentials fallback parts; owner-persistent
Drawing Relay with colors, pointer strokes, keyboard star stamps, undo, retry deduplication and
contributor attribution; isolated preview data; host post likes/saves/comments from profile.

Remaining: arbitrary-package dependency resolution, independently sandboxed mods, pagination for very long profiles,
production authentication/moderation, realtime relay updates, expiring stories, feed-wide application
of profile post styles, marketplace and additional typed feature-storage primitives. Raka now uses generated illustration assets derived from the approved mockup; responsive UI and real data remain live components.

Reference composition pass: live in-profile follow/like/save controls and a shorter Drawing Relay,
with illustrated starter art. Exact original photography, custom lettering and production social
consent remain outside this local demonstration; counts are actual local data.

Visual editing milestone: surface picker, layout sketches, preview-first v2 drafts, live comparison,
copy-from-live and session-local undo of a part change. Original source/import/MCP paths remain.
These sketches are selectors, not screenshots of arbitrary packages; the runtime remains the preview.

Implemented: post-only Photo stack donor (swipe, keyboard navigation, caption flip and existing
social actions). Existing header/story/feature parts remain selected. Dense cockpit navigation
now uses a scrollable transmission strip instead of placing every target on one ring.

Photo posting: **My studio → New photo post** uploads JPEG/PNG/WebP (up to 3 MB), creates a private
photo draft, and selects its profile cover. Add an English title/caption, preview and publish.
**Photos & people → Profile cover** can change/remove the cover without rewriting custom HTML.
Updated Cutouts, Essentials and Photo stack parts read real published covers and captions. Older
published profile packages keep their existing code until explicitly updated. Covers are loaded
locally on demand; automatic thumbnails, cropping and video remain unimplemented.

Raka's default is the two-column Cutouts profile, using the supplied reference artwork and a linked continuation strip.
Photo stack remains an optional post mod. Raka opts into bounded content height (600–4000 px),
so additional posts and the relay editor push the page end down instead of clipping it. Above
that bound the sandbox scrolls internally. Other published designs retain their chosen sizing.

Reference fidelity pass: Raka now uses the supplied original image as an unchanged shared asset,
with SVG viewBoxes selecting highlights and demo photo covers, plus a cleaned derivative
for the header and relay artwork. Live DOM owns identity, actual counts, post captions, actions and drawing input.
No new follower/like counts are fabricated to imitate the reference. Search opens local published
post search; Activity shows current local likes/saves and engagement, not a notification service.
Night mode is in Profile options. The added signoff/headline have been removed.

Raka's header and Drawing Relay now use a cleaned artwork plate: live identity, stories,
participant initials, counts and buttons sit on continuous paper without rectangular cover patches.
The decorative illustration remains raster artwork; live controls and modular profile parts
remain independently editable.

- [x] Raka phone reflow with readable identity/captions, usable relay controls, two-column posts,
      complete page-end navigation, and night-mode ink contrast; checked at 320 and 390 px.

Implemented: direct mod attribution on new installations, public creator collections with active
usage counts, staged Try/Mix previews and reuse of an actual published combination. Next: compare
new mod versions before updating; legacy attribution migration and transitive credits are not built.
