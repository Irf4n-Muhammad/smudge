# 0055 — The cassette: Music drawn as an object

Status: accepted. Stage three of the landing mock "Smudge landing v3" (ADR 0053, 0054).

## Context

A chapter by kind (ADR 0052) is a slot for an object drawn from the person's data: the Run is
a card with its route and stats. Music was still a big number and a list. The mock drew a
cassette, the band on its label, and the thing the person actually has (hours of one band)
read as a thing on the page rather than a figure.

## Decision

- **A Music chapter draws a cassette** from its own fields: the title on the label as the band
  (so the title is not set above it as a heading), the big number and unit under it as the
  hours, "Side A" and the corner line on the label's foot, two reels turning behind the window
  (still under `prefers-reduced-motion`). Nothing is drawn without a title or a number. The
  shell is in the card colour, the label in the accent, the window and reels in the ground.
- On a phone the cassette sits between the note and the lines, 300 px wide and turned a
  little; on a laptop it takes the top of the picture column beside the number, the note and
  the lines, with the photo under it.
- Dani's seeded Music chapter is titled with the band; the version marker is `smudge:v11`.

## Consequences

- `tapeOf` in the template, `.tape` and its parts in the stylesheet; no new settings.
- Stage four of the mock remains: Picks as four blocks.
