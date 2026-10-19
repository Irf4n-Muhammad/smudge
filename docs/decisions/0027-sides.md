# 0027 — Sides: one account, many worlds

Status: accepted.

## Context

People are several things at once: a runner, a festival juror, someone's friend. On Instagram
that ends in second accounts, and the "flip" between a public and a private account did not
change that, because the two accounts stay visible to each other's audience and a post goes to
one audience or the other. The owner wants Smudge to hold several sides of a person in one
account, cleanly, with each side its own world, as the foundation for collections, organiser
stamps and friends made through shared moments.

## Decision

- **A side is membership in a world.** The catalog of sides is shipped (`packages/contracts/src/
sides.ts`): Everyday, which everyone has; Runners, an open house side; and the Film Festival
  crew, a private side run by that organisation. Membership is a record per side and person.
  There is no per-user side creation yet; a side is a platform or organisation thing.
- **Worlds are separate.** One side is active at a time. The feed lists only that side's posts,
  the composer posts into it, and Explore searches inside it. The app wears the side's colour
  so nobody forgets where they are. A reader may instead lay all their sides out together in
  one feed (`layout: mixed`); the default is separate.
- **A post lives in one side.** Its `metadata.side` is set when the draft is made, in the side
  the writer is in; absent means Everyday. Publishing checks membership on the server, so a
  client cannot post into a side it is not in. The writer may also **share** a post to Everyday,
  where everyone who follows them sees it; un-sharing takes it back.
- **Private sides are invisible from outside.** A private side is not listed to non-members,
  joining it is refused with the same answer as for a side that does not exist, and its posts
  are hidden everywhere (feed, link, search, profile) by the same `viewFilter` chain as blocks
  and private accounts. A public side's posts are visible by link, but only listed inside that
  side: `feedFilter` is a listing rule, not a hiding rule.
- **Entry by tap or by proof.** Open sides are joined with a tap. An organisation's side opens
  with that organisation's chapter: redeeming its invite code (or confirming its email) adds the
  chapter and the membership in the same transaction. This reuses the organiser machinery that
  stamps (next step) will build on.
- **Composer per world, not a global picker.** The composer sits inside the active side and
  says where the post goes. There is no "post to which side?" sheet (a Flipside lesson: a
  global picker makes people stop, think, and choose wrong). Moments and website imports stay in
  Everyday for now, so their buttons hide inside other sides.

## Consequences

- Themes are not yet per side: you wear one theme across sides. Each side has an accent colour
  only. Per-side themes and side-specific collections follow once stamps exist.
- Profiles show the active side's posts, since the profile reads the same feed. There is no
  per-side profile page yet.
- Leaving a side keeps your posts in it; they return to view if you rejoin. Deleting them is the
  ordinary delete.
- The studio and MCP publish into Everyday unless a draft's metadata names a side.
- Sides are a catalog change away: adding one needs no migration, but there is no admin screen.
