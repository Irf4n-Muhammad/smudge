# 0041 — Your page: the first thing you open

Status: accepted.

## Context

The concept (`docs/concept.md`, "Direction") moved Smudge from a moment tool to a page: the
first thing you open when you open the phone without a purpose. Stage 1 of the work order
("Tempat sendiri") asks for three things before anything social: a page in about a minute from
a few answers, a one-tap note of what you are doing that piles into an archive, and the page
opening without an account. The profile designer and the easy editor already make pages, but
only for someone who goes looking for them; a new account landed on the feed with a face and
five people to follow, and had no page of its own.

## Decision

- **Five answers, one page.** Right after signing up, `Setup` asks for a photo, one line about
  you, a look (the existing templates, shown as pictures), a colour where the look has them, and
  what is playing or going on right now. `POST /api/me/setup` (`packages/core/src/setup.ts`)
  turns that into one published page: the line goes to the bio and, on the Paint wall, to the
  tagline; the colour picks the palette or tint; the song and the "doing" become the first two
  entries of the archive and, on the Paint wall, its "now" and "on repeat" sections. Every step
  can be skipped; skipping the whole thing keeps the old behaviour (no page yet). The dialog keeps
  the "Welcome" title and the "Skip for now" button, so the account flow and its tests hold.
- **"Lagi ngapain" is one tap and never expires.** `NowService` (`packages/core/src/now.ts`)
  stores entries of four kinds: listening, doing, place, thinking. Each is up to 80 characters,
  with an optional "by" for the song. The newest is the current one; everything stays as an
  archive (capped at 300 per person) that the owner can prune one entry at a time. It is written
  for yourself first, which is why it lives on your page (`NowBar`) and not in the composer.
- **Friends see it under the owner's rules.** Reading someone's entries goes through the same
  filter as their posts: `community.canSeeUser` and `privacy.canSeePosts`. A guest reads through
  `GET /api/public/users/:handle/now` with the public rate limit, on the share page that already
  opens without an account (`/u/<handle>`).
- **The page program can read it.** `profile.read` now also returns `now: {current, listening,
recent}` as the viewer may see it, for the owner's page and for guests. The Paint wall's "now"
  and "on repeat" sections swap in the live entries when they exist, so the page shows today
  without the owner opening the editor. Other templates ignore the field.
- **Moments stay as one program on the page.** Memory cards (ADR 0039) remain under the page;
  nothing in the setup mentions weddings. The entry door is the page itself.

## Consequences

- An account deletion erases the archive with the rest (`accounts.erasers`).
- Entries are plain text; links and mentions are not parsed, and nothing is embedded from a
  music service. A later stage may attach the song itself (pay-for-early-access, concept
  "Creators").
- The page is republished only by the setup; a later tap updates the archive and what
  `profile.read` returns, not the package. The marker is `smudge:v4`, so pages made before this
  pick up the live sections on their next easy-editor save.
