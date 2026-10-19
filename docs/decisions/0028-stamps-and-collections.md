# 0028 — Stamps and collections from organisers

Status: accepted.

## Context

The strongest thing Smudge can hold that a feed cannot copy is proof: not a badge anyone can
screenshot, but a stamp only the organiser of a race can hand out, kept in a collection with
visible gaps. The owner's first in-house world is runners (ADR 0027), and a marathon series is
the natural first collection.

## Decision

- **A collection is host catalog data** (`collections` in `contracts/src/identity.ts`): a
  series of stamps, one per event, owned by an organisation from the `orgs` catalog, optionally
  tied to a side. The first is the Indonesian Marathon Series 2026 with five races.
- **A stamp is a chapter.** It is handed out as an invite code of kind `stamp` that only an
  administrator of the collection's organisation can create, naming the stamp. Redeeming it adds
  a `stamp` chapter (`collection`, `stamp`) like any other invite chapter, with the same
  audience control, and opens the organisation's side with it (ADR 0027). One stamp per person
  per race: a second code for the same race is refused.
- **Collections show their gaps.** `GET /api/users/:id/collections` lists, for every collection
  the owner holds at least one visible stamp in, every stamp of the series with `held` true or
  false. The missing ones are what make someone come back for the next race.
- **Themes open with stamps.** Two new theme event kinds: `stamp` (one stamp opens it; the
  Borobudur finisher medal) and `collection` (every stamp of the series; the series finisher).
  The lock reason says what to finish and whom to ask, so the gallery doubles as the invitation.
- **No new verification path.** Stamp codes reuse the invite machinery: the organiser is the
  only source of truth, and nothing in a client body names a stamp except the code itself.

## Consequences

- Codes can be passed on; a stamp proves the organiser gave someone a code, not that this person
  ran. That is the organiser's problem to solve (one code per bib), as with race results.
- Collections appear under **Who you are** and in the theme locks; the profile page does not
  show them yet.
- Adding a collection or a stamp is a catalog change with no admin screen.
- The demo ships a ready Borobudur code (`BORO2026OK`) so a visitor can collect one stamp
  without switching to the organiser's account.
