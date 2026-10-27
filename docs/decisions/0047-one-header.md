# 0047 — One header: the page says who it is

Status: accepted. Builds on ADR 0045 and ADR 0046.

## Context

On an illustrated page the app drew a full header (back, the smudge wordmark, Edit profile,
search, ☰) and the page drew its own first screen under it: two headers stacked, the first
thing the owner called out. The follow button appeared twice as well, once in the app's menu and
once on the page.

## Decision

- **Three floating buttons.** On a page of its own (`schemaVersion` 2) the app's header is a
  transparent strip over the top of the page with only back, Edit (the owner's pencil) and ☰,
  each a round, blurred button. The wordmark, the name chip and the theme chip are gone from
  the header; search, the proven chapters ("Who they are"), the theme name, day and night,
  reduced motion, the link, "Made with", the creator's mods and reporting wait in ☰.
- **One follow button.** A page that carries `profile.social.toggle` (the Paint wall, Ink &
  Paper) draws its own; the app's menu then offers no Follow. A page without it keeps Follow in
  the menu. Plain profiles (Room, Comic, the default) keep their old header.
- **"Right now" moves to Stories.** On a page of its own the bar no longer sits between the
  header and the page: the hero says the song and the line, and the bar, with its archive and
  the owner's controls, opens the Stories page. A profile without a page keeps it on top.
- **The Paint wall leaves room.** Its hero starts 62px down so the floating buttons never
  cover the index line or the name.

## Consequences

- Search on an illustrated page is one tap further (inside ☰). The e2e for Ink & Paper opens
  the menu first.
- The share page for guests still shows the sign-in bar above the page; aligning it with the
  strip is a later item.
