# 0029 — Plans: posts people join

Status: accepted.

## Context

A post in Smudge is a small page that can hold buttons and keep state (polls, progress,
contributions). Inside a side such as Runners the most useful post is not a photo but a call:
"Long run Sunday, 05:30, GBK, who's in?". Today the answer scatters into a chat group. The
side already holds the people; the post should hold the list.

## Decision

- **Two post capabilities**: `plan.read` answers `{count, going, people}` for the post, and
  `plan.join {going}` adds or removes the current viewer. The host keeps one record per post
  and person (`rsvp`, `${postId}:${userId}`), so page code can only ever change the viewer who
  tapped; it never names anyone. Preview answers an empty practice list and refuses writes.
  The list of names follows who the viewer may see (blocks, hidden accounts), as comments do.
- **A "Plan" style in the easy editor**: when, where and the call in the kicker and headline, a
  note below, and a box with one button, the count and the names. `buildPost` declares the two
  capabilities only for this style and writes a fixed `plan.js`; the studio can open the same
  package as source. Outside Smudge (a saved copy, a guest page) the box says to open it in
  Smudge rather than pretending.
- **No new surface.** A plan is a post card in the feed, like every other post. The feed card
  does not summarise it; the post itself shows who is in.

## Consequences

- The v2 capability limit rises from 8 to 10 so a package may declare every pair.
- A plan has no date logic: it does not close, remind, or expire. That stays with the writer.
- Challenges (a shared counter) and live race-day posts were discussed as the next two shapes
  of the same idea and are not built.
