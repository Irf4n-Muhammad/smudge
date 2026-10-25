# 0037 — The moment group: members, chat and small groups

Status: accepted.

## Context

ADR 0036 gave a moment its invite and its RSVP. The next stage of the work plan is the group the
moment becomes: the people who were invited, in one place, before, during and after the day. A
big Indonesian wedding has hundreds of guests, so the group cannot simply be an open chat, and
guests already split into their own circles (school friends, office, family) who want a space the
couple does not read.

## Decision

- **Membership comes from the invite.** Answering the RSVP while signed in makes you a member;
  a signed-in person with the link can also **join** without answering. Guests without an account
  keep the invite and RSVP only. The host is always the first member. To anyone who is not a
  member, the group answers `NOT_FOUND`, as if it did not exist.
- **Two modes for the main chat.** `announce` (the default) lets only the host write, for a big
  wedding; `open` lets every member write. Only the host switches it.
- **Small groups are made by members, without asking the host**, from people already in the
  moment (up to 50 each, 200 per moment). They always chat freely and are hidden from everyone
  outside them, the host included. The last one to leave takes the group and its messages away.
- **The page.** `/m/<id>` shows a member the moment space: tabs **Undangan** (the invite pinned),
  **Obrolan** (the chat, opening first), **Album** and **Anggota** (members and small groups).
  Others still see the invite and the RSVP.
- **Chat is polled** every four seconds and keeps the last 200 messages per room. Sending has its
  own limit (60 a minute per address). Blocked and hidden people drop out of members and messages
  through the same rule as the rest of the app.
- **Deleting an account** removes its seats and its messages; deleting a moment removes its
  members, small groups and messages.

## Consequences

- The **Album** tab is a placeholder: the live album comes with the door QR in the next stage.
- Polling is simple and enough for a test wedding; a push channel can replace it later without
  changing the routes.
- Guests who answered without an account are not in the group until they sign in and join.
- There are no read receipts, replies, reactions or photos in the chat yet.
