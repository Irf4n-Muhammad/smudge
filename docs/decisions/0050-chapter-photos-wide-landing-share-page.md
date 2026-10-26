# 0050 — Chapter photos, the landing on a wide screen, the share page in the look

Status: accepted. Builds on ADR 0048 and 0049.

## Context

A chapter proves who someone is with one number (ADR 0048); the mockup the owner approved
also gives each one a picture, because a record without the finish-line photo is a claim. The
poster was drawn for a phone, and on a desktop the name sat in the left half of an empty frame
with the photo pushed under it. And a guest opening a share link saw the dark page inside a beige
frame, under a beige bar, with a ring around it from the app's theme.

## Decision

- **A chapter may carry one photo**, one of the owner's uploaded pictures, chosen in the easy
  editor's Chapters sheet. It is written as a page asset: the settings name it by id and the
  runtime hands the page its data URL in `smudgePhotos`, the same way every page asset is
  served, so no new way of reaching pictures is introduced. Photos leave with their chapter;
  a page keeps at most twelve pictures in all.
- **On a wide screen the poster is two columns**: the name, the line and "right now" on the
  left, the photo and the three mono lines on the right; each chapter puts its picture or its
  route beside its numbers. Nothing new is added for the desktop, the same pieces are laid out
  again.
- **The share page takes the look** (the tokens of ADR 0049): the bar on the look's ground
  with the join button in its accent, the page edge to edge up to 1024px with no frame, and the
  invitation on the card colour. The ring the app's theme draws around a page is dropped for a
  page of its own, in the app and on the share link.

## Consequences

- The template marker stays `smudge:v7`; the chapter photo is drawn by the same `profile.html`
  from a setting, so pages already published pick it up when their settings are next written.
- The share page's bar keeps its "Log in" and "Join Smudge"; only its colours follow the page.
