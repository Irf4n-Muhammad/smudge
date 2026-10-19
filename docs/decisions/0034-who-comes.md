# 0034 — Who comes most often

Status: accepted.

## Context

A running group's WhatsApp knows who shows up: it is in the chat, week after week, and then it
scrolls away. A side's home (ADR 0033) has the plans and, on each plan, who said they were
there (ADR 0029). What the community cannot see yet is the sum: across the weeks, who is
actually there. The owner asked for exactly that, "siapa paling sering datang", as the first
polish on the Runners side.

## Decision

- **The home lists the regulars.** `SideHome.regulars` is the people who came most often
  across the side's plans: for each person, how many of the side's plans they were in and how
  many they said they were there for. Most `came` first, then most plans, then by name; only
  people who came at least once; at most five. The home shows them as a ranked list under
  **Most often there**, each opening the person.
- **The same audience rules as the rest of the home.** Only plans the viewer may open are
  counted, and people the viewer cannot see are left out (`PlansService.peopleFilter`). The
  list is a per-person total, never who was at which plan: that stays on each post, where the
  plan's own audience rule applies.
- **Attendance is still self-reported.** "I was there" is the person's word (ADR 0029); the
  regulars add those words up. There is no check-in, QR or organiser confirmation.
- **The Runners' weeks are seeded.** Three past plans, Tempo Tuesday twice and a Sunday long
  run, with who was in and who came, so the demo home has something to add up. They are
  seeded before the track night, which stays the side's newest plan, and backdated so the cards
  read as past weeks.

## Consequences

- The rule lives in `PlansService.regulars`; `SidesService.home` reaches it through the
  `regularLister` hook, like `planLister`, so the sides layer still knows nothing about RSVPs.
- A side with no plans, or whose plans nobody came to, has no list, not an empty box.
- Next: the same recap on a person's profile ("there 12 times with Runners"), and a join link
  that opens the home for people without an account.
