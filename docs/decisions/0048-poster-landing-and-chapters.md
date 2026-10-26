# 0048 — The poster landing, chapters, and the strip's one action

Status: accepted. Builds on ADR 0045, 0046 and 0047.

## Context

The Paint wall landing had too much on its first screen: a ribbon, a "tap to throw paint" note,
an index line, a sticker, a bio quote, the name, the song and the line, and its own Follow
button, with the app's Edit pencil and ☰ floating over it. Every element was fine alone; together
nothing led the eye, the spacing had no system, and the page said nothing a visitor could check.
The concept log (Oct 26) decided the landing proves who the person is with evidence, not claims.

## Decision

- **One idea per screen.** The hero is a poster: the first name as big as the page, the line
  under it in italic serif and the accent colour, the photo tilted into the name, three short
  mono lines (handle, place, bio), and then the song and "right now" as two lines with a rule
  above each. Nothing else. The ribbon, the throwable paint, the index, the sticker and the
  quote in the hero are gone; the bio quote stays as an optional section.
- **One type scale, spacing in eights.** The giant name, 26px lines, 11px mono labels; 8 inside
  a block, 16 to 24 between blocks, 64 between chapters. The ground is dark whatever the app
  theme, with one accent (the palette's second colour) for what matters.
- **Chapters.** Up to three sections under the hero, each one measurable thing: a kind (run,
  work, music, anything), a title, a big number with a unit, a line, up to three small numbers
  and up to three list lines. A run draws a route, the same for everyone, a picture not a map.
  They are typed in the easy editor for now; sources (music, games, running) fill them later.
- **The strip carries the one action.** Edit for the owner, Follow / Following / Requested for a
  visitor, drawn by the app beside the tabs in the thumb zone. The Paint wall's own Follow button
  and `profile.social.toggle` grant are removed; pages upgraded at start lose the grant too. The
  floating header keeps only back and ☰; the app's menu offers Follow only on plain profiles.
  On share pages the action leads to joining.

## Consequences

- Settings gain `chapters` and lose `marquee`; a ribbon written by an older version is ignored
  when read. The template marker is `smudge:v7`, so every published Paint wall is rebuilt at
  the next start.
- Posts and Stories still use the app's own colours; reading the look's tokens is the next step,
  as is the editor for chapter photos, and the landing on desktop.
