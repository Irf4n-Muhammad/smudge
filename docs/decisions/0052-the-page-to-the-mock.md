# 0052 — The page drawn to the mock: Night palette, the Run card, blocks of colour

Status: accepted. Reworks ADR 0048, 0049 and 0051.

## Context

Before stage one of the poster landing was built there was a mock of the whole profile,
"Smudge profile v2" (a landing, Posts, Stories and an empty Posts, 390 px wide, one type
scale, spacing in eights, one accent). The build took the mock's ground, ink and card colours
and little else: the accent came from the old Paint palette (a lime, with a pink and a blue),
the chapters were a giant number and a paragraph instead of the mock's card, Posts was a
collage of four tiles on a dark void instead of the mock's wall of coloured blocks, and
Stories had serif day headings and 56 px thumbnails where the mock had small labels and 44 px
squares. The owner's verdict on the result was that the pages were ugly, and the mock was not.

## Decision

- **Night is the default palette:** teal `#2ba39a`, a warm yellow `#f2c53d` as the accent,
  clay `#e8613c` and violet `#7a5af8`. Paint, Electric, Sunset, Ocean and Mono stay as choices.
  Halloween no longer repaints the page; it recolours only the mark beside the photo.
- **The look carries its tints.** A page's `look` may list up to four `tints`; the app sets
  them as `--page-tint-N` with an ink that reads on each, and blocks without a picture on
  Posts and Stories take them in turn, then the ink. Without tints the accent alone is used.
- **Chapters are drawn by kind.** A Run is a card on the card colour: the route, the time,
  the note under it as a caption, the stats under a rule, and the photo laid over the card's
  corner. Work is the title, a note, the photo with a mark, and its lines as tags. Music and
  anything else keep the big number, the note, the numbered lines and the photo last.
- **Picks and a foot.** Under the chapters the two latest posts sit as blocks (the accent and
  the ink, the cover when there is one) opening in the app's dialog, with the count as the
  way to the Posts page. The page ends with the whole name once more and where it is made.
  `profile.read` hands posts their `createdAt` for the date on a block. The rest of a name
  under the first name is one voice: italic, in the accent.
- **Posts is a wall of blocks:** 108 px rows, 8 px gaps, 12 px corners, the pattern big,
  small, small, wide, wide, small, big on the other side, small; the title in the corner at
  12 px and at 16 px with the date on a big tile. Empty, one dashed tile says what a post is
  and offers the first one; the rest of the pattern stands in the card colour.
- **Stories as in the mock:** "Now" is a card under its own label, each day a small label,
  each line a 12 px clock, a 44 px square and 16 px text. The head's line says whose days
  these are; Posts' head says how many posts.
- **A little grain** over the landing, so the dark ground reads as paper.

## Consequences

- `smudgePalettes.night`, `smudgeLook` with `tints`, `pageLookSchema.tints`; the version
  marker is `smudge:v8`, so published Paint walls are refreshed at start.
- The demo seeds a filled page for Dani Saputra (`seedDaniPage`, once, like the other seeded
  profiles) with three photos of their own (`run-shoes`, `laptop-code`, `dj-hands` under
  `assets/demo/photos`, credited), so the mock can be seen with real pictures at
  `/?profile=dani`. Alex stays without a page: the "you" account walks the setup flow.
- The surname line under the name stays one line and shrinks to fit, like the name itself.
- `PageHead` takes `posts`; `PostsCollage` marks big tiles `collage-big`; Inès's seed drops
  the Latest and Gallery sections, since Picks and the Posts page carry her posts.
