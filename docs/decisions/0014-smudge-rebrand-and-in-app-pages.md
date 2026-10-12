# 0014 — Smudge: new name, new look, and pages that open inside the app

Status: accepted.

## Context

The owner renamed the product to Smudge and approved a design direction: a paint-and-marker look,
seasonal decoration around the feed, and posts that can open a whole page inside the app instead
of sending people to a browser ("website in apps"). This is the first of three stages. The
profile redesign and the template editor come later and need their own approval.

## Decision

- **Brand text only.** Everything a person reads now says Smudge. Internal names stay as they are
  for compatibility: the `forma.*` runtime SDK, `forma:request` bridge messages, `FORMA_*`
  environment variables, the `forma.sqlite` file, `forma-*` localStorage keys and component
  names. Renaming those would break published posts and existing installs for no visible gain.
- **Look.** `apps/web/app/smudge.css` loads last and sets the tokens (paper, ink and four paints),
  the fonts (Rubik Spray Paint for the wordmark, Familjen Grotesk for the interface, Caveat Brush
  for handwriting, from Google Fonts with system fallbacks) and the phone layout: an app header
  with the wordmark, readable type, and full-width rounded posts.
- **Seasons** decorate the space around the feed, never the posts. `html[data-season]` is set
  before paint: Halloween in October, Paint otherwise, or the viewer's own pick (`smudge-season`
  in localStorage). The season changes the paint colours and draws seeded splatters behind the
  feed; Halloween adds a web and bats near the heading. It is independent of day/night.
- **Post buttons** (`metadata.link`, see contracts.md) open the in-app page sheet. The sheet has a
  gap above it so the feed stays in view, and its top bar is always Smudge's own, showing whether
  the page was made in Smudge or comes from another site. Full screen posts use the same sheet.
- **Outside pages** are framed with `sandbox` without `allow-top-navigation` and with
  `referrerPolicy="no-referrer"`. Sites that send `X-Frame-Options` or `frame-ancestors` will
  show blank; the footer always offers **Open in browser**.
- **Launch examples** (`apps/server/seed-smudge.ts`, gated by `system/seed-smudge-v1`, demo mode
  only) add three posts with real people photos, also to existing local data: a festival ticket
  page that opens in the sheet, a mural post whose button opens an outside page, and a rooftop
  photo.

## Limitations

- Whether an outside site allows framing can't be detected from the page, so the fallback is
  always visible rather than shown only on failure.
- The festival page is a demo: choosing a ticket saves the viewer's pick but charges nothing.
- The source pages of two example photos were not recorded; see `assets/demo/CREDITS.md`.
- The Raka profile template and its demo account keep their names until the profile stage.
