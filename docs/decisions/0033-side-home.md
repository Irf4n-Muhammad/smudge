# 0033 — A side's home

Status: accepted.

## Context

A side (ADR 0027) was a filter on the feed: a chip, a colour, a composer prompt. For a
community that already has a WhatsApp group, that is not enough to be a place. The group chat
has the people and the chatter; what it loses is the record: who is in, what is planned, who
came. The owner wants to polish Smudge for real communities, starting with running and
gaming, and the first thing a community needs is a home that reads as one.

## Decision

- **The home sits at the top of the side's feed**, not on a separate page. Instagram's profile
  is a header over a feed, and a side's home is the same shape: a band in the side's colour, the
  name and tagline, how many are in and how much is posted, the people, the side's plans, then
  the posts. One tap on a chip is still the whole switch.
- **`GET /api/sides/:id/home`** answers `SideHome`: the side, whether the viewer is a member and
  since when, `members {count, people}`, `plans` and `posts`. Counts cover everyone; the people
  listed (newest first, at most eight) and the plans are filtered by the same audience rules as
  elsewhere (`CommunityService.canSeeUser`, the post view filter). A private side answers only
  to members, with the same `NOT_FOUND` as a side that does not exist. An open public side
  answers to anyone, so a person deciding to join can see who is there.
- **Plans are the side's agenda.** `PlansService.inSide` lists the posts in a side that declared
  `plan.join`, newest first, with who is in and who came (ADR 0029). The home shows at most three;
  each opens the post. There is no date on a plan yet, so "newest" stands in for "next".
- **Sides tab opens a side.** A side's name in **Your sides** switches to it and lands on Home,
  so the tab is both the list and the way in.

## Consequences

- Rules live in `packages/core/src/sides.ts` (`home`) and `plans.ts` (`inSide`); the route only
  forwards. The hooks `peopleFilter` and `planLister` are installed by the server, like the
  plans' people filter.
- Everyday has no home card; its home would be everyone, and the feed is already that.
- Next for communities: a second seeded side (gaming) to test the shape against, attendance
  summaries per side, and a join link that opens the home for people without an account.
