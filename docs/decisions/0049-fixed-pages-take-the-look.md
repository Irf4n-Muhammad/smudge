# 0049 — The fixed pages take the look's tokens

Status: accepted. Builds on ADR 0045 and 0048.

## Context

Posts and Stories are the app's pages, the same shape under every look (ADR 0045), and they were
drawn in the app's own beige and ink. Next to the poster landing (ADR 0048), dark with one
accent, the switch to Posts was a jump into another product. The mockup the owner approved shows
all three pages on the same ground, with the same two typefaces and the same accent on the strip.

## Decision

- **A look declares tokens, not pages.** A v2 manifest may carry `look`: five colours (ground,
  ink, muted, card, accent, each `#rrggbb`) and two font roles (`display`: serif, hand or sans;
  `label`: mono or sans). Nothing else: the collage, the days, the strip keep their shapes.
- **The app reads them as CSS variables** on the profile page and on the guest pages, and only
  there: `--page-*` for the fixed pages and `--strip-*` for the strip. The editor never takes
  them. A page without `look` keeps the app's colours, so every older look is unchanged.
- **The Paint wall writes its look from its palette:** the dark ground and ink of the poster,
  the palette's second colour as the accent, serif display and mono labels. Pages upgraded at
  start get it too.

## Consequences

- The strip is light on a dark page and the action carries the accent. Posts tiles sit flat
  on the card colour, captions in the app's sans; Stories' days become small mono labels and
  the entries and moments sit on cards.
- Fonts come from the roles the app already loads; a look cannot name a typeface of its own.
- Next: the Paint wall's other palettes get their own ground, chapter photos, the desktop
  landing, the share page's bar.
