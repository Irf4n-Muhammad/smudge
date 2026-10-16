# 0022 — Themes: one look on the profile and in the feed, opened by proof

Status: accepted.

## Context

The owner set the product's centre (2026-10-16): Smudge is the personal website that lives on a
phone. Everyone's profile is their own site, dressed in a theme anyone can design and Smudge
curates, and the look follows their life. A proven moment, such as a trip to Paris, opens a
matching theme, and people should see it without opening the profile: the theme has to show on
posts in the feed too.

Before this change the edge decorations from ADR 0011 already followed their owner into the feed,
but they were separate from the profile, could not show a frame or a typeface, and only membership
or the calendar could open them. The owner also named the three kinds of theme:

- **event**: the Smudge team decides which events exist; designs for an event come from the open
  market and carry the event's label, and only open with that event;
- **members**: proven membership in an organisation;
- **market**: anyone can wear it, with no event or membership behind it.

## Decision

- **A theme is the existing decoration, extended.** Internally the type, routes and stored
  choice keep the name "decoration" (like the Forma names in ADR 0014); people see "Themes".
  Each catalog entry gains a `font` from a fixed list of faces the app already loads, and its tier
  is now `market | members | event`. "Sponsored" stops being a tier and is an optional label on
  any theme. The old seasonal tier becomes an event of kind `season`.
- **Events are a host catalog.** `themeEvents` lists them: the three seasons, and `trip-france`,
  whose proof is a travel chapter for France (photo GPS). Designs name their event by id.
- **One theme, two places.** The feed card of every post by the owner wears it: edge pieces, an
  accent ring and glow around the post, and the owner's name in the theme's face. The post content
  itself is not touched, so it stays readable. The profile page shows the same pieces and ring
  around the owner's world, plus a chip naming the theme and its event
  (`GET /api/users/:id/theme`).
- **The choice cannot outlive the proof.** The stored choice is checked against its lock every
  time it is read. Removing the travel chapter takes the trip theme off everywhere, the same way a
  season theme ends with its dates. Season themes still cannot be an everyday look; trip themes
  can.
- **Wearing is the owner's disclosure.** A travel chapter can be close-circle only, but a trip
  theme says "Trip to France" to anyone who sees the post or profile. The owner chooses to wear
  it, so that is their call; nothing is applied automatically for trips. The profile route answers
  through the same view filter as posts, so a private, hidden or blocking owner's theme is not
  shown to people who cannot see their posts.

## Consequences

- Market themes are free to wear here. Buying, payouts and a submission and curation queue for
  outside designers are not built; the catalog is still shipped with the app.
- Only France has a trip event. Graduation, birthday and more countries follow the same pattern
  but are not added yet.
- Profile packages do not receive the theme inside their sandbox; the host frames the profile
  from outside. Letting templates restyle themselves from the theme is future work.
- Trip proof is still photo GPS, which is evidence and can be edited (ADR 0011).
