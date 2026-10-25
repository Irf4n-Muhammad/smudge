# 0036 — Moments as gatherings: the wedding invite and RSVP

Status: accepted.

## Context

The owner moved Smudge's centre (see `docs/concept.md`): Smudge is where the moments of your life
live, from the plan to the memory, and only the people who were there are in it. A moment is now
a gathering (a wedding, a reunion, a birthday) that people are invited to, not a single page. The
first test is one real Indonesian wedding end to end: invite, RSVP, a QR at the door, and a shared
album. This record covers the first slice: the invite and the RSVP. It changes the earlier line
in `AGENTS.md` that chat and community are out of scope, at the owner's direction.

## Decision

- **Two names.** The proof-locked pages of ADR 0011 (graduation, new job) are now called
  **milestones** in the interface ("Share a milestone"). "Moment" is the gathering. Internally the
  gathering is `gathering` (`packages/contracts/src/gatherings.ts`, `packages/core/src/
gatherings.ts`) and the older pages keep their `moment` names, so stored posts, routes and the
  MCP tools do not change.
- **A host makes an invite from a template.** The first template is `wedding`: the names, a line
  under them, the date, the place and address, a note, a rundown (up to 20 times) and vendors (up
  to 20, typed by the host; vendor pages come later). Making one needs an account; a host may have
  at most 50.
- **The invite opens without an account.** `/m/<id>` is the link a host pastes into WhatsApp. Its
  page title and description (names, date, place) are what WhatsApp shows in the preview. The
  invite never shows who answered: names and counts belong to the host.
- **RSVP by phone number, not by account.** A guest gives a name, a phone number, coming or not,
  how many people (1 to 10) and a message. The number is never stored: a SHA-256 of the gathering
  id and the normalised number recognises a second answer from the same number, which replaces
  the first, and the last three digits help the host tell two people with the same name apart.
  Numbers written the Indonesian way (`0812…`) get `62` in front; anyone else writes `+` or `00`.
  There is no one-time code: a code costs money per message and the test does not need it yet.
  The answer route has its own limit (30 per 10 minutes per address) on top of the guest limit.
- **Signed-in guests are linked.** Someone who answers while signed in is linked to the answer, so
  the moment shows in their own list (`/m`). This is the seed of membership for the moment group.
- **Only the host sees the answers.** `/m/<id>/guests` shows the link with **Send on WhatsApp**
  (a `wa.me` link with a ready message) and **Copy link**, the head count, and every answer.
- **Guest-facing text is Indonesian**, since the families opening the link are Indonesian; the
  host's pages stay in English with the rest of the app.

## Consequences

- No chat, album, door QR, small groups or closing into a memory card yet: those are the next
  stages in the work plan.
- Anyone who knows a number can answer as that number; the host sees it in the list. One-time
  codes or WhatsApp delivery would close this and are an open decision.
- The link preview has no picture yet, only the title and description.
- Deleting an account deletes the gatherings it hosts; answers it gave stay with their hosts,
  unlinked from the account.
