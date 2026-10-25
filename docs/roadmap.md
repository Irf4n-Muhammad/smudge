# Local demo status and next steps

## Implemented

- [x] Real accounts and production mode: email + password signup/login, stored hashed sessions,
      lockout and IP rate limits, email confirmation, password reset, change password, logout
      everywhere, Resend delivery through a transactional outbox, production config checks, edge
      proxy, Dockerfile and deployment guide. See ADR 0012 and docs/deploy.md.

- [x] Community basics: block (both ways, silent), reports with reasons and a moderation queue
      (remove/restore post, dismiss, suspend), in-app notifications with unread badges, people
      search and suggestions, one-to-one messages between people who follow each other, optional
      Google login, and account deletion. See ADR 0013.

- [x] Proven chapters (campus/work email codes, organisation invites, partner confirmation, photo
      GPS), proof-locked moment pages with circle/public audience, preset one-per-person reactions,
      edge decorations with members-only, sponsored and seasonal tiers, local seasons by country,
      simulated decaying creator pool, open signup and full-screen posts. See ADR 0011.
- [x] Themes: one look worn on the profile and around every post in the feed (edges, frame,
      name face), in three kinds (event, members, market), with trip events opened by a proven
      trip (France first). See ADR 0022.
- [x] More trip themes (Japan, South Korea, Thailand) and trips to a place inside a country
      (Bali). See ADR 0026.
- [x] Open theme market: anyone submits a theme made of their own HTML and CSS, moderators review
      it, and approved themes join the market; pieces are drawn as images. See ADR 0024.
- [x] Wear and edit themes: a gallery with a preview of yourself, and a personal version where
      you drag pieces and rewrite designer-marked text. See ADR 0025.
- [x] Sides: one account, many worlds (Everyday, Runners, a private festival crew side), each
      its own feed and composer, a post in one side with an explicit share to Everyday, private
      sides invisible from outside, entry by tap or by an organisation's invite. See ADR 0027.
- [x] Stamps and collections: organiser-issued stamp codes, a collection with visible gaps,
      and themes that open with one stamp or the full set. See ADR 0028.
- [x] Plans: a post people join from inside the post, with the count and the names. Challenges
      (a shared counter) and live race-day posts are the next shapes. See ADR 0029.
- [x] Share cards: a picture of you in a side, saved or shared from the phone, whose link lands
      inside the side. See ADR 0030.
- [x] Gift themes: a market theme sent to someone with a note, worn from "Gifts for you".
      No payment yet. See ADR 0031.
- [x] Navigation in Instagram's shape: four tabs plus Messages and Notifications, one feed with
      a For you / Following picker, Search with Posts and People, More behind the profile ☰.
      The fifth tab is Sides. See ADR 0032.
- [x] A side's home: inside a side, the feed opens with the side's colour, name, members, post
      count and plans, so a community reads as a place. Gamers is the second seeded community,
      with a squad-up plan, a clip and a bracket. The home also ranks who comes most often
      across the side's plans, from the Runners' seeded weeks (ADR 0034). Search finds sides,
      **Invite** shares the side's link, and `/s/<id>` opens the home without an account
      (ADR 0035). Next: the same recap on a profile, an invite that is not guessable, chat on a
      plan. See ADR 0033.
- [x] Moments as gatherings, first slice: a wedding invite from a template at `/m/<id>` that opens
      without an account, an RSVP by phone number that never stores the number, and a guest list
      only the host sees, with Send on WhatsApp. The ADR 0011 pages are now called milestones.
      See ADR 0036.
- [x] The moment group: signed-in guests who answer (or join from the link) are members of a
      space with the invite pinned, a chat that is announcements only until the host opens it,
      a member list, and small groups members make themselves that even the host cannot see.
      See ADR 0037.
- [x] The day: a door QR on the host's phone that changes every 30 seconds and records who came
      in, and a live album every member fills, sorted into chapters by the rundown, with
      photographers first, likes only their poster sees, "Foto kamu" and wishes. Photos are
      resized and lose their GPS position. Next: locking the album after the day and closing
      into a memory card. See ADR 0038.
- [x] Instagram-style feed: free scrolling, one column, even 4:5 windows, load ahead, feed always
      wins the scroll gesture. TikTok-style snap mode is future work. See ADR 0023.

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

- Accounts: no Apple login, two-factor or data export. Notifications and messages poll; no push.
  Single instance on one SQLite file. Not yet deployed anywhere; the owner chooses the host.

- Identity: email is a local outbox, organisations/admins are a static catalog, photo location is
  evidence not proof, no lunar-calendar seasons, buying market themes and real payouts are not
  built. Community themes cannot use web fonts, outside images or interaction, and approval is
  one moderator's call with no appeal. Personal edits cover position and text only, not colours. Trip themes exist for France, Japan, South Korea, Thailand and Bali; places use coarse boxes.

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
- Moderation is manual (one queue, env-configured moderators); no automated abuse detection.
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

Group chat, communities, games and marketplace expansion remain separate product decisions.

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
