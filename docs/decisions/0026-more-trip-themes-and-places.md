# 0026 — More trip themes, and trips to a place inside a country

Status: accepted.

## Context

Only France had a trip theme (ADR 0022), so for most people "a moment opens a theme through
proof" was something they could read about but not do. Most of our users live in Indonesia,
where "a trip to Indonesia" proves nothing interesting: the trip that matters is to Bali.

## Decision

- Trip events for Japan, South Korea and Thailand, each with one catalog theme (Sakura gate,
  Seoul night, Tuk-tuk). Proof works as for France: a JPEG whose GPS falls in the country.
- **Places.** A `places` catalog holds provable places inside a country, each a few coarse
  boxes. Bali is the first. A trip event may name a `place` as well as its `country`.
- A photo inside a place adds a travel chapter with `place` set ("Been to Bali"), separate from
  the country's chapter ("Been to Indonesia"). One chapter per country-and-place, as before.
- A place's chapter also proves its country; a country's chapter never proves a place. The
  place only counts when the photo's country is the place's country, so the two cannot disagree.
- Designers can make themes for every trip event through the market (ADR 0024) with no other
  change, since the submission form lists the events from the same catalog.

## Consequences

- Boxes are coarse. Bali's west box also takes in the very tip of eastern Java. As before, a
  photo's location is evidence, not proof: it can be edited.
- Adding a place or a country trip is a catalog change plus a theme; there is no admin screen for
  it yet.
- Older travel chapters have no `place`, so a trip proven before this change counts for its
  country only.
