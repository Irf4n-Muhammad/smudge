# 0045 — The landing page is yours; Posts and Stories are fixed

Status: accepted. Builds on ADR 0041 and ADR 0044.

## Context

Looking at the page after ADR 0044, the owner's verdict was that it still looked like Instagram:
posts, stories and photos as sections in a rigid grid, songs at the bottom, two headers stacked
(the app's and the page's). The direction instead: think of a website or a portfolio. The first
screen is a landing page, free in what it says, and the posts and stories come after it as
pages of their own, kept for the long term. Templates make the free page reachable: a person
picks one and changes the name, the photo, one line, the colours.

The one rule that cannot be left to the page: there must always be a way to the posts and the
stories. A page that has to draw that button itself will one day forget it, hide it, or make it
unreadable.

## Decision

- **Two layers.** The landing page is the person's own program, as profiles already were: an
  HTML package in the sandboxed iframe, made from a template and edited. Posts and Stories are
  Smudge's pages, the same shape under every look, reached at `?page=posts` and `?page=stories`
  in the app and at `/u/<handle>/posts` and `/u/<handle>/stories` for a guest.
- **The strip is drawn outside the page.** A small bar with Page · Posts · Stories floats over
  the bottom of every profile, rendered by the app (`PageStrip`), never by the iframe. A look
  may colour it through CSS variables (`--strip-bg`, `--strip-ink`, `--strip-on`), not remove it.
- **Posts are a collage, not a grid.** `PostsCollage` lays tiles on six columns in a fixed
  pattern of five (one big with two small beside it, then two wide), the big tile changing side
  each round, with a slight tilt. Fixed patterns keep any count tidy; the look may restyle
  tiles, not reflow them.
- **Stories are the days, read, never typed.** `PagesService.timeline` merges three things the
  server already knows, newest first: the person's posts, their "right now" archive (ADR 0044,
  minus the `posted` entries, which the tiles already say) and the moments they came to (ADR
  0039). The viewer groups them by local day: Today, Yesterday, then dates. Nothing is posted
  as a story, and nothing expires.
- **No counts of followers.** The fixed pages carry a head with the name, the handle and the
  one line; the share page's landing drops its head and counts when a page exists, because the
  page says who it is.
- **Audience rules are the feed's.** `PagesService.posts` runs every post through
  `social.viewFilter` for the viewer (guest, follower, owner), and the timeline reuses the now
  archive's own filter and the memory cards' filter. Guests see no memory cards.

Routes: `GET /api/users/:id/posts`, `GET /api/users/:id/timeline`, and their public twins
`GET /api/public/users/:handle/posts` and `/timeline`. The member Posts page uses the posts the
app already holds; the timeline is fetched.

## Consequences

- The memory cards' own row on the profile is gone; moments live on the Stories page.
- The share page's grid of posts under the page is gone; a landing page shows only the page,
  and a profile without a page shows the plain head and the collage.
- The templates still draw their own post grids inside the landing page. The next step rebuilds
  the Paint wall on this frame (landing only, pointing to the fixed pages), then the other
  looks one by one, and the easy editor becomes a landing editor.
- Old moments appear at noon UTC of their day, since a moment has a date, not a time.
