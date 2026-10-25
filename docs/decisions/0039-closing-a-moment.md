# 0039 — Closing a moment: the locked album, the thank-you and memory cards

Status: accepted.

## Context

The fourth stage of the work plan is after the day. The album should stop changing once the
photos are in, the link the guests already have should become the keepsake, and everyone who
came should carry the moment on their profile. This is the first piece of the attendance
timeline (work item 9 in the plan).

## Decision

- **Three phases from the date.** A moment is `upcoming` before its date, `live` from the day
  until the album locks, and `closed` after. The album locks on its own at the end of the third
  day after the date, at the venue (Jakarta time for now), so photos that arrive late still fit.
  The host can lock it earlier. The phase is part of the public invite.
- **What the lock stops.** No new photos, tags or wishes (`ALBUM_LOCKED`). Likes still work, and
  anyone can still take their own photo down, as can the host.
- **The host closes it.** The host writes a thank-you, picks a cover photo, and moves photos up
  or down within a chapter, also after the lock. Moved photos keep the host's order ahead of the
  usual one (photographers, likes, time).
- **The same link becomes the keepsake.** Once closed, `/m/<id>` opens on the thank-you with the
  cover for anyone, and the RSVP goes away. Members land on the album with the thank-you above it.
- **The cover is public.** Only the cover the host picked is served without an account, for the
  closed page and the memory cards. Every other photo stays members-only.
- **Memory cards.** The host and everyone who came in through the door QR (ADR 0038) get a card
  once the moment is closed. Joining from the link is not enough: the card says you were there.
  Cards show on the profile page under "Moments you were at", newest first, with the title,
  date, place, cover and how many came. They follow the same rule as posts, so a private
  account's cards show only to the people it accepted, and blocked people see none. Each person
  can hide their card from the Album tab.

## Consequences

- Picking photos for your own profile and friends' feeds, decided in `docs/concept.md`, is not in
  yet; a card links to the album instead.
- Cards show on the signed-in profile page, not on the public `/u/<handle>` page or inside
  custom HTML profiles.
- The host cannot reopen a locked album; that can come if a real host needs it.
- Moments still carry no time zone; outside western Indonesia the lock can come a few hours
  early or late.
