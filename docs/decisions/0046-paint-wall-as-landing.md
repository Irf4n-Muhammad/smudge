# 0046 — The Paint wall becomes a landing page

Status: accepted. Builds on ADR 0045; reworks ADR 0015 and ADR 0016.

## Context

With the fixed Posts and Stories pages in place (ADR 0045), the landing page no longer has to
list anything. The owner's direction for it: a website's first screen, not a profile. The name
and one line, then what is playing and what is going on, right under the name; no counts of
followers or posts; no grid. Templates make this reachable: a person picks one and changes the
details.

## Decision

- **The hero is the page.** The Paint wall's first screen keeps the giant painted name, the
  italic line, the photo and the follow button, and gains `hero-now`: a song card and a "right
  now" line directly under the name. Both read the owner's live archive first (`profile.read`
  returns `now`, ADR 0041/0044): the song shows a Spotify mark and moving bars when it comes
  from Spotify, and the line shows how long ago. Until the archive has anything, the card shows
  what the owner typed in the editor (`repeat` and `now` in the settings).
- **Nothing is counted.** The "N posts so far", the follower count in the ribbon, the "See
  posts" button and the post count sticker are gone. The ribbon says what the owner wrote, or
  the handle.
- **Posts leave the landing page.** The "All posts" grid with tabs is removed from the
  template; the fixed Posts page is the one place for all posts. "Latest" (the newest post,
  big) and "Gallery" (a strip of picks) remain as optional sections, so a landing page can
  still point at a highlight.
- **"Now doing" and "On repeat" are no longer sections.** They live in the hero. The section
  kinds are now latest, selected, quote, countdown, wall, quiz and cat; a new page starts with
  none. Older settings that name a removed kind are read without it.
- **The easy editor edits the hero.** Tapping the song or the line opens "Song & right now"
  (song, artist, what you are up to). The section sheet lists the seven extras. The setup after
  sign-up writes the song and the "doing" line into the hero instead of adding sections.
- **Template version v6.** Every Paint wall file carries `smudge:v6`; `applySmudgeSettings`
  refreshes older copies from the template on the next edit, as before. Inès's seeded page is
  re-seeded (`profile-smudge-v2:ines`) with the new sections.

## Consequences

- A page made before this keeps working until its owner edits it; then it is upgraded and its
  post grid disappears, with the Posts page one tap away on the strip.
- Other looks (Ink & Paper, Essentials, Room, Comic) still carry their own post lists on the
  landing page; they are rebuilt one by one on the same frame.
- The hero's Spotify mark is a label, not a logo; connecting Spotify is the owner's own step
  on the "Right now" bar.
