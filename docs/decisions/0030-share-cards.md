# 0030 — Share cards

Status: accepted.

## Context

People bring friends into a place through the chats they already use. A link to a profile is a
link to a page; what travels in a running group's chat is a picture. Smudge can draw that
picture itself from what it already knows: the person, the side, the theme they wear and the
stamps they hold, and send whoever taps it into the same side.

## Decision

- `GET /api/me/card?side=<id>` answers your own card as one SVG (1080×1350, a story's shape) with
  nothing referenced from outside: the avatar is embedded, text is escaped, and the only text
  that looks like a link is the printed landing address. `GET /api/me/card/data` answers the
  same facts as JSON without the avatar. Only your own card, only for a side you are in.
- **The browser makes the PNG.** The share dialog (in **Your sides**, "Card" on each side)
  draws the SVG on a canvas and offers **Save image**, the device's share sheet when it exists
  (with the picture), and **Copy link**. No image service, no upload.
- **The link lands inside the side.** The card points at `/u/<handle>?side=<id>`. A guest sees
  the public page with "Join <name> in <side>"; a signed-in member is switched to that side,
  joining first when it is open. A private side is never named in a link, so a card for one
  points at the page alone. `GET /api/public/sides/:id` names open sides for the guest page.

## Consequences

- The card's look is fixed server-side (the side's colour, the theme's accent and font). A
  designed card per theme is a later step.
- Fonts are system fonts, so the picture differs a little between devices.
- Signing up from a card's link does not yet carry the side through signup.
