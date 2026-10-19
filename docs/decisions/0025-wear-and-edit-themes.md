# 0025 — Wear a theme, then make it yours: drag pieces and rewrite their text

Status: accepted.

## Context

ADR 0024 opened the market to anyone who writes HTML and CSS. The owner pointed out that most
people will never do that: they pick something a designer made, then want to change it a little.
"You use someone's theme, then you can edit it with drag and drop or change the words." The
Themes page also mixed the two jobs, putting the code studio next to the themes people browse.

## Decision

- **Gallery first.** Themes is a gallery with filters (All, Events, Members, Market). Tapping a
  theme opens a preview of a pretend post by you wearing it, with a **Wear** button, or the lock
  reason. A bar shows what you wear, with **Edit my theme**. Designing from code moved to its own
  page behind **Send your own theme**; earnings live there too.
- **Personal edits.** Whoever may wear a theme can save their own version of it: a new position
  for each piece and new words for the text the designer opened. The theme itself never changes,
  so other wearers and the market keep the designer's original, and the credit stays.
- **Positions stay in the edge band.** Each moved piece must still pass the ADR 0024 band rule
  (`pieceDepth <= themeBand`) and the offset limit. The editor slides a dragged piece along the
  edge instead of letting it go further in, and arrow keys move a piece for keyboard users.
- **Text slots.** A designer marks editable text with `data-text="name"` on an element. The wearer's
  words replace that element's text as plain text when the piece is drawn, never as markup, so a
  slot cannot add code. Longer words shrink to roughly the slot's original length.
- **Re-checked on every read.** An edit is stored per theme in the wearer's preferences and is
  applied only while it still fits the theme: positions only if the piece count still matches and
  each still sits in the band, texts only for slots the theme still has. A designer changing or
  a moderator removing the theme can therefore never leave a stale edit covering a post.

## Consequences

- Colours, sizes and the typeface are not editable yet; the owner chose position and text first.
- Text inside a piece is drawn as part of an image, so it cannot be reported or moderated on its
  own; a wearer's words show only on their own profile and posts. Slot text is capped at 40
  characters and refuses control characters.
- The shrink is a length heuristic, not a measurement, so unusual fonts can still clip.
- Locked themes cannot be edited; an edit survives taking the theme off and comes back when it is
  worn again.
