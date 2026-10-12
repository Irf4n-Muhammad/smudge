# Smudge — make your corner of the internet

A working local social-feed demo with programmable posts and external AI authoring through MCP.
Smudge was called Forma; internal names (the `forma.*` SDK, `FORMA_*` settings) keep the old
name for compatibility (ADR 0014). Posts can carry a button that opens a page inside the app.
Custom HTML/CSS/JavaScript controls the experience inside a post. The platform owns identity,
permissions, persistence, publication, and the surrounding feed controls.

## Open it

Requirements: Node.js 20.13+ and npm (CI uses Node 22). No cloud account, Docker, AI API key,
subscription, or paid hosting is needed. Installation downloads open-source dependencies.

```powershell
cd "D:\Social Media"
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:3000**. Keep the terminal running; Ctrl+C stops the servers.
On macOS/Linux use `npm` instead of `npm.cmd`. `npm run dev` launches all three local listeners:
web 3000, API 3001, and isolated runtime 3002. They bind to loopback, not the local network.

## Put it online

`npm run dev` is the local playground. For real people, Smudge has a production mode with email +
password accounts, real email through Resend, and one Docker container that serves the app and the
separate post-runtime hostname: `npm run build && npm start` with the settings in `.env.example`.
Step-by-step guide: [docs/deploy.md](docs/deploy.md). Decision record: ADR 0012.

In the playground, **Create an account** and **Log in** at the bottom of the sidebar use the same
real account system; confirmation and reset emails appear in the local demo inbox on **Who you
are**. The gear icon in the top bar opens **Account** (email status, change password, log out,
blocked accounts, delete account).

**Community basics** (ADR 0013). **Find people** searches by name or @handle and suggests friends
of friends. **Notifications** shows follows, likes, comments and stickers, with a red badge for
unread ones. **Messages** works between people when one follows the other. A post's **⋯** menu has
**Report post** (with a reason) and **Block**. Alex is a moderator in the playground, so
**Moderation** lists open reports with Remove post, Dismiss and Suspend account. On phones these
live in the bottom bar and **More**. In production, set `FORMA_ADMIN_EMAILS` for moderators and
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` for "Continue with Google" (see docs/deploy.md).

## Try these paths

**Who you are, proven.** Run `FORMA_TODAY=2026-10-20 npm run dev` to see Halloween decorations
everywhere (omit it for today's date). Leo's **Finally graduated.** moment opens full screen from
the feed: a counter intro, decoding titles, chapters and a sticker wall where each visitor can
leave one preset sticker. As Alex, open **Who you are**, enter `alex@student.lembayung.edu`, read
the code from the **local demo inbox** (no email leaves this app), verify, then **Share a moment →
Graduation**. Locked templates show their rule: new job (work email `@kopinusantara.co`), birthday
(only around the stored date), trip (a JPEG with GPS), together (partner confirms), club or event
titles (invite code; Maya admins Teater Senja, Leo the film festival). **Decorations** lists free,
members-only, sponsored and seasonal pieces that cling to post edges, with a simulated creator
payout. **Create an account** at the bottom of the sidebar opens signup to anyone. Rules: ADR 0011;
design brief: `docs/design-handoff.md`.

**Profile > Menu > Made with** shows the recorded mod and pinned version for each surface.
**Use this combination** previews the actual published composition with your identity and posts;
choose **Use this preview** to open your private draft, then publish when ready. A creator credit
opens their shared collection and current public-profile usage counts. Collections also open at
`/?profile=you&mods=1`. Older designs without recorded provenance are labelled explicitly.
Library Try/Mix now opens a separate preview first, including changed surfaces and permissions.
Cancel preserves the original draft; the private preview remains available in draft history.

**My profile → Customize profile → Browse & share mods** opens the local mod library.
Try **After Hours / Music zine** for a spinning vinyl identity, gig poster posts, ticket highlights
and persistent setlist voting. **Try** creates a private draft with your identity and content.
**Mix into current draft** replaces one surface; undo is available in the editor. Preview, then
**Publish profile**. To share your own v2 draft, choose **Share current draft**, select its parts,
name it, review the included source/assets, and click **Share mod**. Another demo account can now
find and install it. Covers are optional; graphic covers are labels, not runtime screenshots.
Updates create new immutable mod versions; existing installations never update automatically.

Open **http://127.0.0.1:3000/?profile=raka** for the English comic profile and working Drawing Relay.
Click **Add your mark**, draw or **Add a star**, choose ink, undo, then save. Refresh to see persisted
contributions. Post previews and story highlights open real posts. Follow, likes and saves work
inside the profile; comments use the host dialog.
To make your own version, open Kai's (@kai.inks) **☰ → Use this design** while signed in as another demo account.
The editor opens a private copy with your identity. Edit your name, bio and avatar; open
**Composition** to change illustration size/position, section order, highlights, post columns and
card shape. **Apply changes to preview** saves the draft; **Publish profile** makes it public.
**Make it yours** selects Ink & Paper or Essentials for each surface independently, or removes a part.
Undo the last edit, compare with live, and preview at desktop/mobile sizes before publishing.
**Add a photo post** uploads and publishes a real post separately from the profile design.
You can also switch the demo account to Kai to edit a copy of its live profile.
Removing the relay preserves its drawings. Draft preview has separate practice data.

Profile v2 supports original HTML/CSS/JS fragments through import/MCP, not just these examples.
Parts share a sandbox and permissions; arbitrary third-party compatibility is not guaranteed.
The relay is bounded to 200 contributions and updates on refresh. Story highlights are published
story posts, not expiring stories. Post styling here applies to profile previews only.

Visit `/?profile=maya` for an interactive room or `/?profile=leo` for a vertical comic. Objects
open their owner's real published posts. Public profiles share stable host follow/report/back
controls, night mode and a saved reduced-motion preference.

Open **My profile → Customize profile** (`/?profile=you`) to create a room/comic draft or import
your own JSON package. Edit the manifest/source, save, preview as a visitor on desktop/mobile,
then publish. Restore a previous publication or the default layout from the version list.
The external MCP client can author entirely new profile packages through the same domain/API.
Existing profile source is never overwritten by restarting the demo.

Click **Break the frame** or open `/?mode=breakout` for the vertical scrolling overlap demo.
Comic artwork extends into the space post, its ship reaches up into the comic, and exhaust
spills toward the quiet landscape below. Try **Give me a push**, **Fire thrusters**, and
**Show boundaries** to reveal visible frames versus clipped extension envelopes. Transparent
decoration does not block clicks. Likes/saves and **Open story** use existing publications.
These three compositions are host-authored visual prototypes; MCP-authored extension layers
are not yet supported. The normal feed and its isolated programmable posts remain available.

Click **Enter hyperspace** (or open `/?mode=cockpit`) for the spatial navigation experiment.
Drag the planet to rotate the post orbit, use arrow keys while the orbit is focused, or select
a small planet. **Enter this world** opens the real isolated post; the transmission panel reads
and writes its actual comments. Likes and saves use the same feed data. **Back to feed** exits.
Ambient motion respects reduced-motion preference and can be paused. This cockpit is a built-in
prototype of a whole-app composition, not yet an AI-authorable application shell.

Start with the new worlds: drag Maya's keepsake photos and click one to open a memory, choose
a star in Leo's constellation, or open Inès's envelope. Use the moon/sun control at the top
to switch day/night; your choice survives reload and applies to the studio and new worlds.

1. Open the note in Maya's scrapbook; reload and see that your place was saved.
2. Filter **Stories** and choose a path. Your vote and reading progress persist.
3. Filter **Together** and add a memory as Alex. Switch **Preview as** to Inès and try again:
   Inès can read but is not an invited contributor.
4. Like, comment, bookmark, follow, search, or open a profile. Counts reflect local data.
5. Open **My studio**: make a draft, edit its title/caption or source, upload a photo, save and
   preview, then publish. **Use format** on an existing post creates a separate editable draft.
6. Connect a local AI client with [the MCP setup](docs/mcp.md). It can author an interaction that
   is not in the seed catalog. It does not need a model hosted by Smudge.

On narrow screens, bottom navigation opens the feed, following, studio, saved posts and profile.
Desktop account switching is a simulation feature, not public authentication.

## What is implemented

- Local shared mod library with creators, optional covers, complete/partial sharing, immutable
  versions, private installation, part mixing and MCP authoring. After Hours adds persistent
  profile polls, with separate practice votes and owner-bound public results.

- Identity/avatar drafts, bounded composition controls for the Raka shell, photo publishing inside
  the profile editor, one-step undo, and atomic identity/design publication and restoration.
  Visual controls write ordinary source files; arbitrary source/import/MCP authoring remains available.

- Modular profile v2, partial package composition through editor/API/MCP, and persistent Drawing Relay.

- Public programmable profiles, private drafts, real owner data, visitor preview, immutable history,
  conflict-checked publication/restoration and profile MCP tools; room/comic starter packages.

- Responsive Next.js/React feed, profiles, format filters, following, saved posts, comments, reports.
- Blocking, moderation queue, notifications, people search, direct messages, Google login and
  account deletion (ADR 0013).
- Four seeded formats: photo, scrapbook, branching story/poll, collaborative notes.
- Three additional full-width worlds with custom interactions, plus persisted day/night appearance.
- Studio with versioned drafts, package import/validation, photo upload, preview, reuse and publish.
- A separate-origin iframe runtime with CSP, a validated message bridge and server-side capabilities.
- Viewer progress, one-vote-per-viewer polls, and contributor permissions.
- Local SQLite persistence (SQL.js). Drafts, publications, images and interactions survive restart.
- An official-SDK stdio MCP server; authoring uses the same HTTP/domain rules as the browser.
- Unit/integration tests, Playwright browser/MCP tests, and a cross-platform CI configuration.

This is a **local demo**, not a public production service. Photo upload supports JPEG/PNG/WebP
up to 3 MB; video upload/transcoding and audio controls are not implemented. External network,
arbitrary dependencies and user-authored server code are not enabled in posts. An iframe does not
provide a hard CPU/memory quota. Real accounts, moderation and a deploy guide exist (ADR 0012, 0013); MCP
OAuth scopes, data export and push notifications still require work. No host is chosen yet.

## Data and commands

Data lives in ignored `.local/forma.sqlite`; the local MCP credential is `.local/mcp-token`.
Do not share the token. There is one database-owning server process. To back up local work,
stop the app and copy the SQLite file; keep the original until recovery is verified.
Browser sessions reset when the server restarts, but content remains. The default demo user is Alex.

| Command                           | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Start web, API and runtime locally                       |
| `npm run check`                   | Formatting, strict types, core/contract tests            |
| `npm run build`                   | Compile backend and build frontend                       |
| `npx playwright install chromium` | One-time browser install for E2E tests                   |
| `npm run test:e2e`                | Browser/MCP flows using a separate `.local/e2e` database |
| `npm run format`                  | Format maintained source and docs                        |
| `npm run demo`                    | Original terminal-only v1 foundation demonstration       |

Stop the development servers before running E2E tests: they use the same ports and start their own
instance. Tests never overwrite `.local/forma.sqlite`. Failure traces go in `test-results/`;
desktop/mobile screenshots go in `artifacts/`. CI is configured but has not been run on GitHub here.

## Find the right place

| Location                                             | Responsibility                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| [Web components](apps/web/components/forma-app.tsx)  | Feed shell; studio, post card and runtime are separate modules |
| [API server](apps/server/index.ts)                   | Local identity, HTTP boundaries, tickets, runtime delivery     |
| [Social domain](packages/core/src/social.ts)         | Shared permissions, drafts, publication, state                 |
| [Database](packages/core/src/database.ts)            | Single-writer SQLite transactions and file persistence         |
| [Contracts](packages/contracts/src/experience.ts)    | v1/v2 package, metadata and bridge schemas                     |
| [Runtime document](packages/runtime/src/document.ts) | Bundling and browser policy                                    |
| [Post SDK](packages/post-sdk/src/source.ts)          | Creator-facing browser API                                     |
| [MCP adapter](apps/mcp/index.ts)                     | Tool definitions and calls to the shared API                   |
| [Architecture](docs/architecture.md)                 | Boundaries and tradeoffs                                       |
| [Contracts guide](docs/contracts.md)                 | Authoring and compatibility                                    |
| [Debugging](docs/runbooks/debugging.md)              | Reproduce and locate failures                                  |
| [Contribution guide](CONTRIBUTING.md)                | Review and verification conventions                            |
| [Roadmap](docs/roadmap.md)                           | Current scope and remaining limits                             |

Demo photography credits are in [assets/demo/CREDITS.md](assets/demo/CREDITS.md).

## Paint wall profile

New profiles start from **Smudge · Paint wall** (ADR 0015): a giant painted first name filled with
your newest photo, tap anywhere to throw paint, your latest post, a sideways strip of picks and a
tabbed grid. It follows the Paint/Halloween season, and post buttons open in the in-app page
sheet. Open `/?profile=ines` to see it. Its parts mix with Ink & Paper in the mod library.

## Easy profile editor

On your own profile, **Edit profile** opens the easy editor (ADR 0016). Pick a vibe from
pictures, then tap any outlined part of your Paint wall to change it: your big name, the italic
line (`*stars*` make words italic), the top corner, the ribbon, your name, bio and photo. The
bottom bar changes colours, adds sections (Now doing, Gallery, The Wall, Big quote, On repeat,
Countdown), reorders or hides them, and previews the result. Edits save to a private draft;
**Publish** makes them public. **The Wall** lets visitors stick short notes on your profile; you
can take any of them down, and anyone else can report one. **Advanced editor** opens the same
draft in the source editor.

Every vibe can be tapped now. Ink & Paper and Essentials: name, bio, photo, line-up, highlight
shape, post columns and card style, accent colour and part order. Room and Comic: name, bio,
photo, colour and their one big line (the room's pinned note, the comic's opening headline).
While a change saves, the next version of the preview loads behind the current one and swaps in
once it has drawn, so the preview no longer flashes.

## Ink & Paper artwork (Kai's profile)

Raka now uses the approved mockup's illustrated direction: a generated pencil-hand/avatar/brush
lettering atlas, torn paper, photographic demo covers and overlapping compositions. Assets and the
exact generation prompt are in `assets/raka/README.md`. The geometric pencil and old preview SVGs
have been removed from the current source. Other working profile/feed examples remain available.

Startup preserves existing publications. To deliberately publish the latest bundled Raka design
while keeping its history and drawing contributions, run the local app, then execute
`node --import tsx scripts/refresh-raka.ts`. This command updates only the demo Raka profile through
normal session/draft/publication APIs; it prints the previous publication ID for restoration.
The art is not a flattened screenshot: highlights, post navigation, drawing, and host controls remain
interactive. Cover artwork is illustrative; opening a post still opens its original publication.

Raka's reference composition now places real Follow under the bio and real like/save controls below
post previews. Profile options retains host controls. Two optional v2 social grants use owner-bound
core rules (ADR 0005); preview cannot write real social state. Relay art decorates the canvas; the
original bundled seed has an illustrated presentation, while user strokes and stored data remain
unchanged. The mockup's invented follower/like numbers are not substituted for local counts.

## Visual profile workbench

Modular drafts open in visitor preview. Surface tabs and layout sketches let you replace Profile,
Posts, Stories or Feature independently; the full runtime preview shows the actual result.
Use **Edit a copy of live profile** to preserve the published design while working. **Compare with
live** displays the current publication with input disabled. **Undo last part change** restores the
previous draft package using its current revision. Undo lasts for this editor session; it is cleared
by selecting/saving another draft. Nothing publishes until **Publish profile** is clicked.
Source editing, JSON import and MCP remain available for original layouts and behavior.

## Photo stack post mod

In a modular profile draft, select **Posts → Photo stack / Flip & explore**. Swipe horizontally,
use previous/next or focus the stack and use arrow keys. Flip a photo to read its real caption;
Open post opens the original publication and comments. Likes/saves use existing social state;
preview writes are disabled. This donor provides only the post slot; other parts and stored data
remain intact. Raka's two illustrative covers reuse the existing atlas; other posts show title cards.

Cockpit uses a scrollable transmission strip when more than eight posts would crowd its orbit.
All posts remain selectable; the central dial and previous/next controls still navigate the library.

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

Raka's header and relay artwork have been cleaned so live identity, stories, participant initials,
counts and buttons no longer need flat rectangular patches. Decoration remains raster artwork;
profile/post/story/feature parts and live controls remain independently editable.

Raka phone layout now reflows the identity, story highlights and Drawing Relay rather than scaling
all controls down with the illustration. It retains two post columns, readable captions and live
social actions. Tests cover 320/390 px text sizes, touch targets, relay editing flow and page-end
clearance above navigation. Night mode preserves dark ink on the illustrated paper surfaces.
