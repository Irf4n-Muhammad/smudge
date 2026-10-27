# 0054 — The owner's words: a manifesto under the hero

Status: accepted. Stage two of the landing mock "Smudge landing v3" (ADR 0053).

## Context

The racing driver's site that set the standard for the landing opens its page, after the name,
with a few sentences in the big face: what the person is about, said by them, as large as the
page. The Paint wall had a line of up to 60 characters beside the name (the tagline, usually a
surname or a few words) and nothing of the kind below the hero. The mock put one there.

## Decision

- **A `manifesto`** of up to 140 characters joins the settings, written in the editor's "Your
  words" sheet by tapping the block. It is set under the hero in the big face, in capitals, with
  the words wrapped in `*stars*` in the serif italic and the palette: the first in the accent,
  the next in the first paint, in turn. Without words nothing is drawn; the owner sees a hint
  while editing.
- **The mark has its own colour.** The hero's mark takes `--mark`, the first paint by default;
  Halloween recolours `--mark` alone, so the manifesto's paints and the Music blob keep the
  palette whatever the season (which ADR 0052 intended).
- Dani's seeded page carries a manifesto; a data dir seeded with the earlier version is written
  again. The version marker is `smudge:v10`.

## Consequences

- `smudgeSettingsSchema.manifesto`, `#manifesto` in the template, `fieldTitles.manifesto` and
  its sheet in the easy editor.
- Stages three and four of the mock remain: a cassette for Music, Picks as four blocks.
