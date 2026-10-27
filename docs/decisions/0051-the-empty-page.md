# 0051 — The empty page: what a new member sees before they have anything

Status: accepted. Builds on ADR 0048 and 0049.

## Context

A member who has just answered the five sign-up questions has a poster with their name, their
line and no photo, no chapters, no posts and one "right now" entry. On that page the name was
squeezed into one line with a gap above it (the size went on the span, not the heading), the
line under the name was repeated in the mono lines (sign-up puts the same text in the bio),
the photo slot was a cream card with two capitals, the page ended after the hero, Posts was one
sentence in the dark and Stories a card and a label. The owner saw a hole, not a page to fill.

## Decision

- **The page knows its owner.** The host tells the frame `owner: true` with the appearance
  message and the frame sets `data-owner` on its root. A page may use it only to show hints
  for filling itself in; it never changes what a visitor sees, and it grants nothing.
- **The poster carries its own hints.** Without a photo, the initials sit in the look's serif
  on the accent colour, and the owner reads "Add a photo" in its corner. Without chapters, the
  owner sees three empty ones, Run, Work and Music, each a line about what would go there and
  "Tap to write"; a visitor sees nothing there. The bio is left out of the mono lines when it
  is already the line under the name, and the name's size goes on the heading.
- **Posts empty is the collage drawn faintly:** three dashed tiles in the collage's shape, the
  words in the big one, and for the owner a button into the composer.
- **Stories are lines of the day.** Each day is a heading in the look's display face; under it
  every post, entry and moment is one line with the clock on the left, a small cover and the
  title, instead of tiles that said nothing about when.

## Consequences

- `Runtime` takes `owner`; the SDK sets `data-owner`; the Paint wall reads it in CSS only.
- `PostsCollage` takes `onCreate`; the profile page passes the app's composer through.
- Story rows replaced story tiles; the `.story-cap` is a title and a caption, not an overlay.
