# 0058 — Posts as a louder wall, Stories as shelves that open full screen

Status: accepted. Reworks the Posts and Stories parts of ADR 0052.

## Context

The owner looked at three directions for each fixed page, drawn on the Paint wall: for Posts a
louder wall of blocks, a zine of one post a row, and a scrapbook; for Stories shelves of upright
stories per day, a tidier timeline, and a story opened full screen. They picked the louder wall
and the shelves, with the full-screen story. Posts and Stories are the app's pages, the same
under every look (ADR 0045, 0049), so the change reaches the Track and pages without a look too.

## Decision

- **A big face for the fixed pages.** Under a look, the page's name is set in Bricolage
  Grotesque (`--page-big`, owned by the app like the shapes) with a second voice under it in the
  look's display face and accent: "Posts / all of them", "Stories / day by day". The look's
  contract does not change.
- **The wall, louder.** The collage keeps its pattern (ADR 0052). Each block carries its number
  from the newest in the corner, its title in the big face (bigger on wide and big blocks) and
  the date under it in the label face; a picture gets a shade at its foot. A big or wide block
  without a picture sets its title in the display face, as words.
- **Days as shelves.** Each day is its name in the accent, the date and how many, then a row of
  9:16 stories swiped sideways: the clock on top, the title and a line at the foot, a picture or
  the look's tints in turn. A "right now" line sets its words in the display face. Moments and
  "right now" entries are stories as posts are.
- **A story opens full screen.** Progress bars for the day, the person and the time, a tap on the
  right or left half (or the arrow keys) to go on or back through every day, Escape to close.
  The title is a block of the next tint with the line under it as a chip; a post or a moment has
  a way to open it. A story runs on after six seconds unless the person asked for reduced motion.
- **The ink on a tint is chosen by contrast.** A light tint takes the darker of the look's
  ground and ink, a dark one the lighter, so the Track's cream ground no longer puts cream words
  on its lime.

## Consequences

- A story on the shelf is a button that opens the viewer, not a link; the moment's link moves
  into the viewer.
- Filters by kind and like counts on blocks, drawn in the mock, need the post's format and
  counts on `PostTile`; they are left for a contract change of their own.
