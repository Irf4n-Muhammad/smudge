# 0032 — Navigation in the shape people already know

Status: accepted.

## Context

The shell had grown eleven sidebar entries (feed, following, saved, who you are, themes,
profile, explore, people, notifications, messages, moderation), a studio entry, three create
buttons, a "Ways to browse" menu and a row of format filters (For you, Scrapbooks, Stories,
Together). Someone opening the app could not say in a sentence what it was for. Instagram has
already spent the years on this: a handful of places, each one a tab, and everything else
behind the profile.

## Decision

- **Four tabs, two corners.** Home, Search, Create and Profile are the tabs: a bottom bar on
  phones, the left rail on wider screens. Messages and Notifications join the rail; on a phone
  they sit in the top corner of Home, where Instagram keeps them.
- **One feed.** Scrapbooks, stories and collaborative posts are posts; they scroll past in the
  same feed and the format filter row is gone. The picker at the top of Home chooses **For you**
  or **Following** and holds the two ways to browse (Break the frame, Enter hyperspace). Sides
  stay as the row under it.
- **Search is one place.** Explore and Find people are the **Posts** and **People** tabs of
  Search.
- **More is the profile's.** Saved, Themes, Who you are, Share card, My studio, Account
  settings and Moderation sit behind **More** in the rail and behind ☰ on your own profile, so
  a phone reaches them from the Profile tab. Every profile now shows the same tabs and the same
  ☰; the illustrated profiles' rail and the feed's rail are one shape.
- **Nothing was removed.** Each destination moved; none was cut. The sides row, the composer,
  the moment and website entries in the composer, and the demo account switcher at the bottom
  of the rail are unchanged.

## Consequences

- The feed's "Ways to browse" button and the format filter buttons are gone; tests reach the
  browse modes through the feed picker and find posts by scrolling or searching.
- A fifth tab is deliberately empty. Instagram's is Reels; what belongs there in Smudge is a
  product question for later, not a layout one.
- The product no longer presents formats as sections, so the catalog of formats is something a
  post wears, not a place a person visits.
