# 0015 — Smudge profile: the Paint wall template

Status: accepted.

## Context

Stage two of the Smudge redesign (ADR 0014) is the profile. The owner wanted profiles that feel
like an award-site page rather than a settings screen, built on the existing modular profile
system so each part stays swappable, plus the end of the old Raka and Forma names in anything a
person reads.

## Decision

- **Paint wall** (`apps/server/smudge-profile.ts`, files in `apps/server/profiles/smudge/`) is a
  v2 profile package and the first starting point in the editor. It has three parts: the profile
  hero (the first name set huge and filled with the newest post's photo, the @handle in italic
  serif, tap-to-throw paint, a follow button and a stats marquee), a latest-post card in the story
  slot and a sideways strip of picks plus a tabbed grid in the post slot.
- **Self-contained parts.** Each part links `smudge/parts.css` and `smudge/helpers.js` itself and
  scopes its CSS under `.sm`, so a Paint wall part can be mixed into Ink & Paper and the other way
  round without file conflicts. Helpers are guarded globals because the renderer inlines a linked
  file once per reference. The package is 8 files, leaving room under the 20-file limit when mixed.
- **Fonts** (Bricolage Grotesque, Instrument Serif; SIL Open Font License) are embedded as base64
  woff2 latin subsets in `smudge/fonts.css`, because the runtime CSP only allows `data:` fonts.
- **Seasons reach profiles.** The `forma:appearance` message carries an optional `season`
  (`paint` or `halloween`, see contracts.md). The SDK sets `html[data-season]` in the frame and
  exposes `forma.appearance.season`. Paint wall switches its paints on Halloween.
- **Post buttons** open from a profile the same way as from the feed: the post dialog shows the
  post's link bar (`PostLink`), which opens the in-app page sheet.
- **Names.** The Raka templates are now "Ink & Paper" (comic/cutouts/orbit) and "Smudge /
  Essentials". The demo account is Kai Moreno (@kai.inks); startup rewrites the record only when
  it is still the untouched original. The internal id `raka`, the template key and file paths stay.
  Kai's header uses the composed layout, not the reference artwork, because that art has "raka!"
  lettered into it.
- **Seeding.** Inès gets a Paint wall profile (`seed/profile-smudge-v1:ines`) only if she has
  never published one; the shared mod library gains "Smudge · Paint wall".

## Limitations

- The visual identity controls (name, bio, avatar) work on Paint wall, but the composition
  sliders built for the Ink & Paper shell don't change it; its source is editable.
- Existing local data where Inès already has a profile keeps it.
- Kai's composed header is less detailed than the old reference artwork.
