# 0035 — A side's link

Status: accepted.

## Context

A community grows through the chat it already has. The share card (ADR 0030) is a picture of
one person; what a running group pastes into WhatsApp is a link to the group. Until now a side
could only be found from the Sides tab, by someone who already had an account, and its home
(ADR 0033) only opened once signed in. Three things were missing: finding a side by name in
Search, a link worth pasting, and a page behind it that works without an account.

## Decision

- **Search finds sides.** On the Posts search, a query whose every word is in a side's name or
  tagline shows those sides above the posts, with **Open** for a side you are in and **Join**
  for an open one (same word rule as post search). Private sides are never listed, since
  `SidesView` never carries them to someone outside.
- **`/s/<id>` is the side's link.** **Invite** on the side's home hands the link to the
  device's share sheet (WhatsApp is one tap away on a phone) or copies it. Private sides have
  no link and no button.
- **The link opens the home without an account.** `GET /api/public/sides/:id/home` answers
  `SideHome` plus the side's recent public posts, for an open public side only; a private side
  and Everyday are `NOT_FOUND` like a side that does not exist. The page shows the band, name,
  tagline, how many are in and how much is posted, the people, the plans, who comes most often,
  a grid of recent posts, and **Join <side> on Smudge**, which goes through `/?side=<id>` like a
  share card's link. A signed-in person who opens the link is sent into the side in the app.
- **The guest is the empty viewer.** `GUEST` (the empty string) is now exported from
  `packages/core/src/social.ts` and is what `SharingService` always was asking about. The sides
  and plans layers accept it in their reads (`home`, `inSide`, `regulars`, `view`) and answer
  with the same audience rules as for a stranger with an account; a guest is never a member and
  can never write (`join` still requires a real actor).

## Consequences

- `SharingService.side` composes the page: the home through a `sideHome` hook installed by the
  server, the recent posts by its own guest rules (no moments, no hidden people, the view
  filter). The route only forwards, with the guest rate limit.
- Signing up from the link does not yet carry the side through signup (ADR 0030's gap still
  holds): the landing switches or joins once the person is signed in.
- Next: a per-side invite that is not guessable (today the id is the link), and Search for
  sides on the People tab too.
