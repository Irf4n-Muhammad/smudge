# 0011 — Proven chapters, locked moments, edge decorations and preset reactions

Status: accepted.

## Context

Product direction ("who you are, proven"): a social feed for everyone where people show verified
life chapters (campus, work, clubs, titles, trips, partners), celebrate them with special moment
pages that only open with proof, and dress ordinary posts with transparent decorations that cling
to the edges. Visitors never get free-form space on someone else's moment. Everyone receives the
current season's decoration by default and can change it. Decorations are free; creators are paid
from a fixed ad pool that favours new adopters.

## Decision

- `packages/core/src/identity.ts` owns all rules; `packages/contracts/src/identity.ts` holds
  schemas and the trusted host catalog (organisations, stickers, decorations, seasons, moment
  templates). HTTP routes in `apps/server/identity-routes.ts` only parse and forward.
- Chapters are only created by proof: a campus/work email code (local outbox stands in for email
  delivery; only a hash of the address is kept, one account per address), an organisation invite
  issued by its admins, a partner confirming from their own account (ending removes both sides),
  or a JPEG whose EXIF GPS falls in a supported country. There are no self-typed chapters.
- Moments are generated packages (`apps/server/moments.ts`) published through the normal draft and
  publication path. The proof is checked when publishing and recorded in the same transaction as
  the post, so a close-circle moment is never briefly public. The verified mark is computed live
  (chapter still exists) and drawn by the host outside the frame; moments cannot be reused as a
  format, so their look cannot be copied without the proof. Birthday opens within a day of the
  stored date, which can be set once.
- Audience: `circle` means the owner plus mutual followers. `SocialService.viewFilter` hides those
  posts from the feed, runtime tickets, comments, likes, reports, capabilities and asset reads.
- Reactions: one preset sticker per person per post (`/api/posts/:id/reactions` and the new post
  capabilities `reactions.read`/`reactions.place`). Options come from the moment template or the
  owner's current decoration plus defaults. Moments hide like counts from non-owners.
- Decorations: catalog SVG pieces anchored to post corners (host-rendered, pointer-events none).
  Members tier unlocks with a chapter from that organisation; seasonal tier only inside its window.
  The active season's default applies automatically; a manual choice is stored per season
  instance (`season:year`), so it resets next year. Country selects local seasons.
- Creator estimate: fixed monthly pool × creator share, split by current wearers weighted
  `max(0.1, 0.5^(days/30))`, with automatic season defaults at half weight. Simulated only.
- Open signup creates a demo account and session. `FORMA_TODAY=YYYY-MM-DD` pins the calendar.

## Limits

Organisation admins and domains are a static demo catalog. Email is not sent. Photo location is
evidence, not proof, and country boxes are approximate. No lunar-calendar seasons (Ramadan, Eid,
Imlek) yet. Decorations are not authorable by users yet: user-supplied SVG would need sanitising
and review. No payouts, ads or ledgers exist; the estimate is arithmetic over current state.
MCP tools for these features are not added; the HTTP API is the only boundary.
