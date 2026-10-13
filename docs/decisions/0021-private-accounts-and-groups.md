# 0021 — Private accounts and group chats

Status: accepted.

## Context

The owner asked for private accounts with follow requests and for group chats. Both touch who
can see what, so they have to hold everywhere posts and messages appear, not only on the screens
that were changed.

## Decision

- **Privacy is one more view filter.** Blocks and moderation already decide visibility in a
  single `viewFilter` chain. A private account adds a link to that chain (owner, accepted
  follower, or nobody), so the feed, Explore, search, share links, profiles and mentions all
  respect it without their own checks. The profile page, name and bio stay public so people know
  whom they're asking.
- **Requests are records, not half-follows.** A request is its own record; following stays a
  plain follow. Accepting turns the request into a follow. Going public accepts every waiting
  request, so nobody is left stuck.
- **Groups only include people you could message.** The same rule as one-to-one messages (they
  follow you, or you've talked) stops strangers being dropped into groups. Any member can add
  people they could message; only the owner removes others or renames; anyone can leave.
  Ownership passes on when the owner leaves, and an empty group is deleted.
- **Blocking hides, doesn't evict.** Inside a shared group, messages between people who blocked
  each other are hidden from each of them; neither is removed, since the group belongs to
  everyone in it.
- **Polling, like direct messages.** Group threads refresh every few seconds; there is no push
  channel yet.

## Consequences

- Posts made before going private become private too; there is no per-post audience yet.
- Groups are capped at 32 people and have no photos, reactions or mentions in messages.
- Real-time delivery (and push notifications) remain future work for both kinds of messages.
