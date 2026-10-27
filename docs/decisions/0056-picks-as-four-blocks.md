# 0056 — Picks as four blocks, and a taller page

Status: accepted. Stage four, the last, of the landing mock "Smudge landing v3" (ADR 0053–0055).

## Context

Picks (ADR 0052) showed the two latest posts as blocks under the chapters. With the roll and the
cassette above it the band read thin, and on a laptop two blocks left half the row empty. The
mock drew four: two photos, then two blocks of colour carrying a line of the post in the serif,
so the band is pictures and words whatever the posts hold. The band and the foot had also fallen
off the page: a profile frame may grow to 4000 px (ADR 0007), and a landing with three chapters,
their snaps and a roll of seven runs past 5000 px on a phone, so the page ended at the roll.

## Decision

- **Four latest posts, by date.** Picks takes the four newest posts by `createdAt` (the feed's
  order is insertion order). The first two carry their covers as before. The third and fourth are
  blocks of colour, teal (`--p1`) with the ink's dark and violet (`--p4`) with white, the title and
  the day at the top and the post's caption set in the italic serif at the foot, clamped to four
  lines. A block is a button that opens the post, like the others.
- **Two across on a phone, four on a laptop.** The grid is two columns of 200 px blocks on a
  phone and four of 300 px on a laptop, 12 px apart.
- **The page may run to 8000 px.** The size message, the manifest's `height` and
  `mobileHeight` accept 600–8000 px (was 4000), and the SDK's measure clamps to the same. The
  host still coalesces and bounds what it accepts (ADR 0007); the bound is just wide enough for
  the landing drawn to the mock.
- Dani's seed gains two posts dated before her reunion and skate session, so those two keep
  their covers and the new ones are the blocks: "The cut is at 11 minutes" and "Super 8 test".
  They are added once, keyed by their own seed marks, to a data dir seeded earlier as well.

## Consequences

- The version marker is `smudge:v12`; the Dani seed marker is `profile-smudge-v6:dani`.
- `profileSizeSchema` and the manifest heights allow up to 8000; `tests/profiles.test.ts`
  rejects 8001. `docs/contracts.md` and `docs/architecture.md` say so.
- The four stages of the mock are done. What remains of the landing's plan is sources (music,
  games, running) filling chapters by themselves (roadmap).
