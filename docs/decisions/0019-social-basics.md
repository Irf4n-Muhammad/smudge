# 0019 — Editing, deleting, replies, mentions and share links

Status: accepted.

## Context

The owner wants the everyday social basics before inviting friends: fixing or removing a post,
answering a comment, tagging someone, and sending a link to a person who has no account yet.

## Decision

- **Edit in place.** Republishing a post's draft updates the post rather than adding a second
  one, so likes, comments and the link survive. The post menu's **Edit post** opens the easy
  editor or the studio, whichever made the post, and the button says **Update**. Posts show
  "Edited". Moments are not editable: their page only means something next to its proof.
- **Delete** is owner only, asks first, and takes everything people left on the post with it. The
  draft stays in the studio so nothing the owner made is lost by accident.
- **Replies** are one level deep, like most social apps, so threads stay readable on a phone.
  Authors delete their own comments; owners can clear any comment on their post.
- **Mentions** are plain `@handle` text, linked when the handle exists. Only people who can see
  the post are notified, and blocks are respected, so a mention can't be used to reach someone
  who opted out.
- **Share links** (`/p/…`, `/u/…`) are read-only and need no account. They reuse the same audience
  rules with an empty viewer, so a link never shows more than a stranger with an account would
  see. Guest runtimes have their own smaller ticket pool and get no write capabilities. Link
  previews (title, description, cover) come from the same public data.

## Consequences

- Before this, republishing made a new post. Scripts that relied on that now update the earlier
  post; to make a separate post, start a new draft (or use "Use this format").
- Moments are not shareable by link yet.
- Guests can't vote in polls, follow, like or comment; the page invites them to join instead.
