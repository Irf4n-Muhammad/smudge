# 0053 — Photos laid freely: snaps, the roll, and chapters closer together

Status: accepted. Extends ADR 0050 and 0052. Stage one of the landing mock "Smudge landing v3".

## Context

The landing drawn to the mock (ADR 0052) read well on a phone and thin on a laptop: each
chapter was one row, words left and one photo right, then a long stretch of empty ground before
the next. The owner's verdict was that it should be tighter, fuller and better to look at. The
reference that settled what "fuller" means was a racing driver's personal site: its content is
what anyone has (a next event, a line, an affiliation with a year, photos with a place and a
year), and what fills the page is many real photos placed freely, each captioned where and when.
Not a denser grid, and not a signature object; photos. Smudge's bet is that the craft is done
once in the template and the person's own pictures and numbers make the page theirs.

## Decision

- **A chapter carries up to three photos.** Besides its photo (ADR 0050) a chapter may have a
  `caption` under it and up to two `snaps`, each a photo of the owner's with a caption of up to
  30 characters, meant as a place and a year ("Sentul, 05:40", "Bandung, 2022"). The page lays
  them around the chapter, turned a little, over the edges of the card or the big photo.
- **From the roll.** The settings gain `roll`, up to eight captioned photos laid in a band under
  the chapters: two across on a phone, four on a laptop, each turned and pushed up or down so no
  two sit level. The band is not drawn without photos; the owner sees a hint while editing.
- **Closer together.** Chapters sit 48 px apart on a phone and 88 px on a laptop, with the rule
  and the number as the separator. Work puts its big photo first and its words to the right on
  a laptop, so the pictures alternate sides down the page.
- **The page may carry twenty pictures.** A profile manifest lists up to 20 assets (was 12):
  three chapters of three, eight on the roll, and room for the odd one.
- **The editor.** Each chapter gets a caption field under its photo and two more photo slots
  with captions; tapping the roll band opens its sheet, with the same slots up to eight.
- Dani's seeded page (ADR 0052) carries two snaps on Run and Work, captions, and a roll of seven,
  all from the bundled demo photos; a data dir seeded with the earlier version is written again.

## Consequences

- `snapSchema`, `chapterSchema.caption` and `.snaps`, `smudgeSettingsSchema.roll`,
  `smudgePhotoIds` (every photo the settings name, for the manifest's assets);
  `profilePackageSchema.manifest.assets.max(20)`. The version marker is `smudge:v9`.
- The template groups a chapter's pictures in `.pics` (not drawn on a phone, where the prints
  sit among the chapter's parts; a column of its own on a laptop), and adds `#roll`.
- Stages two to four of the mock remain: the owner's line as a manifesto under the hero, a
  cassette for Music, and Picks as four blocks.
