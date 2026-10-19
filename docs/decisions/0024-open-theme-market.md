# 0024 — Open theme market: anyone designs in HTML and CSS, Smudge curates

Status: accepted.

## Context

The owner's product centre (ADR 0022) is that themes are made in bulk with free HTML and CSS:
"everyone can make it, we filter". Until now every theme was catalog data shipped with the app,
and its pieces were trusted SVG inserted into the page as markup. Showing a stranger's HTML and
CSS on every post of whoever wears it needs two things the catalog never did: a way to draw code
nobody vetted without letting it act, and a review step before it reaches anyone.

## Decision

- **Submissions.** Any signed-in person sends a theme: a name, an accent, a typeface from
  `themeFonts`, a kind (`market`, `event` with an `eventId` from `themeEvents`, or `members` with
  an `orgId` from `orgs`) and 1 to 6 pieces. A piece is an edge, a box (12 to 360px, offset at
  most 400px) and its own HTML and CSS (6,000 characters each). The creator comes from the
  session; the body schema is strict, so a `creatorId` is refused. One person can have at most
  5 submissions waiting.
- **Drawn as images.** The app parses a piece's HTML in an inert document only to make it
  well-formed XHTML, wraps it with its CSS in an SVG `foreignObject`, and shows that SVG as an
  `<img>` data URI. Browsers render image documents in isolation: scripts never run, no outside
  resource loads, the image takes no input and the page cannot read into it. Catalog pieces keep
  their trusted SVG markup; `OverlayPiece` is now either `{ svg }` or `{ html, css }`, and only the
  first is ever inserted as markup.
- **Rules that tell the designer early.** Script, frame, form and media tags, event handler
  attributes, `javascript:`, `@import`, and `url()`, `src` or `href` that are not `data:` URIs are
  refused. They could not work inside an image anyway, so these checks are feedback and queue
  hygiene, not the containment.
- **Edge band for everyone.** The ADR 0023 rule that pieces live within 110px of an edge (on at
  least one axis) is now a shared function in the contract, enforced on every submission and
  tested against the catalog, so community themes cannot cover the post people are scrolling
  past.
- **Curation.** Moderators (the same people who handle reports) see waiting themes with a
  preview and the code, and approve or reject them with an optional note to the designer. They
  can also take down an approved theme. Pending and rejected themes are visible only to their
  designer and to moderators. A designer can withdraw or delete anything not in the market; an
  approved theme can be someone's look, so it leaves only through review.
- **Approved themes join the catalog.** The identity service reads approved themes alongside the
  shipped ones, with the same locks: a community event theme still opens only with its event's
  proof. Taking a theme down makes it stop resolving, so its wearers simply wear nothing (or
  their season default), the same way a lapsed proof works today. Deleting an account deletes
  that person's designs.

## Consequences

- Images cannot load web fonts or outside files, and cannot be interactive: designers work with
  system fonts, CSS and `data:` URIs. Animations do run.
- One moderator approves or rejects; there is no appeal, second review or automated visual check
  for offensive imagery. Reports on a theme are not built.
- Rendering relies on the browser's isolation of SVG images. That isolation is long-standing in
  current browsers, but it is the security boundary here and is noted as such.
- A community theme's code travels with every themed post in a feed response (up to about 72 KB
  per theme at the limits). Fine for this prototype; a real deployment would send each theme once
  per response or cache it by id.
- Payment for market themes and real creator payouts remain unbuilt (ADR 0022).
