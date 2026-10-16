# 0023 — An Instagram-style feed: free scrolling, even windows

Status: accepted.

## Context

The owner set a rule for every creative feature (2026-10-16): however expressive a theme or post
is, doomscrolling has to stay comfortable. The feed then worked against that:

- on phones it snapped one post per screen and would not let a flick skip ahead;
- posts loaded only when about to appear, so scrolling showed a loading placeholder on each one;
- posts had different heights, and desktop alternated one big window with a pair;
- a page taller than its window scrolled inside the frame, so a swipe over it scrolled the post,
  not the feed.

The owner chose free scrolling like Instagram for the main feed. A TikTok-style snap feed may come
later as a separate mode for a different audience; it is not part of this feed.

## Decision

- **One free-scrolling column.** No scroll snapping. Desktop shows a single 520px column; phones
  the same column edge to edge.
- **The same 4:5 window for every post**, including worlds and moment covers. The whole page opens
  with **Enter world**, unclipped.
- **The feed always wins the gesture.** Feed frames receive `forma:layout { clip: true }` and the
  SDK hides document overflow, so the frame cannot scroll and scrolling chains to the feed. Taps
  inside a post still work.
- **Load ahead.** Frames open about two screens before they arrive and are disposed again when
  that far away, trading some memory for no placeholders during a normal scroll.
- **Theme pieces stay along the edge.** A catalog test keeps every piece within 110px of the edge
  it clings to on at least one axis; buttons sit above pieces.

## Consequences

- Fixed-height pages designed for 460–510px show the window background below them on desktop.
- Animations inside posts still run while scrolling (pausing them by cutting `animation` would make
  them jump); only reduced motion stops them.
- A page's own inner scroll areas are not blocked.
- More frames are alive at once than before; very long sessions on low-end phones are untested.
