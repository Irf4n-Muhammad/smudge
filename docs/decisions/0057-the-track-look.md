# 0057 — The Track: a second look for the Paint wall

Status: accepted. Stages one and two of four of the landing mock "Smudge landing v4" (the
Track).

## Context

The Paint wall is one page on a dark ground with a palette of paints (ADR 0052). The second
mock took the register of a driver's site instead: a cream ground with contour lines, one lime,
the name as big as the page with the owner standing cut out of a photo in front of it, their
things cut out around it with sticker lines, and the next thing on their calendar in a corner.
Everything on it is the owner's; nothing is a stock picture. The mock was drawn as a new
template, but a second template would double the parts, the editor's sheets, the upgrade path
and the seeds, for what is the same page in different clothes.

## Decision

- **A look inside the one package.** The settings gain `look`: `"wall"` (the Paint wall, the
  default) or `"track"`. The same files serve both; the Track recolours the whole page through
  the CSS variables scoped to `.sm` (`--wall` cream, `--ink`, one lime as `--p2` and `--mark`,
  an olive and a deep lime as the other paints), with the dark theme keeping the cream. The
  shell sets `data-look` on `<html>` from the settings before any part draws, so the fixed
  Posts and Stories and the strip recolour without a line of script, and `manifest.look` carries
  the cream and the lime to the app's chrome (ADR 0049).
- **A hero of cutouts.** When the look is the Track, `profile.html` hides the poster hero and
  draws the Track's: the name as a two-line logo and a two-letter mark in the bar, the place in
  the corner, the giant name with the surname in the italic serif and lime, the owner's `cutout`
  in front of it with a "that's me" note, up to two `things` (`{photo, caption}`, the caption a
  lime sticker) turned around it, the chapters' labels as paper stickers, `next` (`title` up to
  30, `when` up to 20) as a bordered card in the corner, and the tagline and place as the
  italic line at the foot. The hero is 700 px on a phone and 800 px on a laptop, its bottom
  corners rounded over the page below.
- **Backgrounds are removed by the owner, not the server.** A cutout is a PNG with a
  transparent background, made on the phone (press and hold yourself in a photo, copy or share
  the cutout) and uploaded like any photo; the server keeps a PNG's alpha as it is. No image
  model or paid service is added (AGENTS.md).
- **One more vibe.** The setup and vibe pickers show **Track** next to Paint wall: the same
  package with `look: "track"`, so choosing it keeps every setting the owner has and only the
  look changes; choosing another vibe keeps that vibe's own look. The look can also be switched
  under Colors on any Paint wall.
- **Up to twenty assets everywhere.** ADR 0053 raised the profile manifest's assets to 20, but
  the experience schema the same package is checked against still said 12; it says 20 now, so a
  page with full chapters, a roll and the cutouts is accepted.
- **The band and the wall (stage two).** Under the hero's curve, on the dark olive, the mark
  and "Right now" over the owner's doing as a still from a film: the Work chapter's photo (or
  the first chapter's, or the roll's first) behind, the text and the place in the corner, the
  progress as a lime bar when it is what the owner typed, "just now" when it is a live entry.
  The manifesto (ADR 0054) follows on the same olive, centred, its starred words in the serif
  and the lime. The chapters come back on the cream with their top corners rounded over the
  olive, and the roll lays its prints square, the second of every three in black and white.
  Text set on a paint uses `--on-paint`: the ground's colour on the Paint wall, the ink on the
  Track, so a label on the lime stays readable.
- Dani's seeded page is a Track: cut out of his photo, his board and a shoe cut from the
  skate photo (`assets/demo/cutouts/`, credited), "Senayan Open · 2 Nov" next up, a line of his
  own. A data dir seeded earlier is written again, once.

## Consequences

- `smudgeLookKinds`, `smudgeLook(palette, look)`, `smudgeSettingsSchema.look`, `.cutout`,
  `.things` (up to two), `.next`; `smudgePhotoIds` counts the cutouts; the version marker is
  `smudge:v13`. `experienceSchema.manifest.assets.max(20)`.
- The template: `.thero` and its parts in `parts.css`, scoped under `html[data-look="track"]`
  for the colours; `profile.html` `trackHero()`; the shell's `data-look` line, injected into
  older shells by `applySmudgeSettings`.
- The editor: a Look row under Colors; sheets for the cutout, the things and Next up, reached
  by tapping them on the page; the Track vibe with its picture. `setupPage` keeps a template's
  look. `profileTemplates.track`.
- The template: `.tband` with `trackBand()` drawn from `heroNow`'s doing, `data-edit="now"`
  so the owner edits it where the poster's hero did; the Track's `.manifesto`, `.chapters` and
  `.roll` rules under `html[data-look="track"]`.
- Stages to come from the mock: stats, affiliations and the foot (three); reveal, count-up and
  parallax motion (four).
