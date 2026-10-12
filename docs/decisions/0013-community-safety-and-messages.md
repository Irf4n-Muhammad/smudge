# 0013 — Blocking, moderation, notifications, people, messages, Google and deletion

Status: accepted.

## Context

With real accounts (ADR 0012) Forma can go online, but a public social network also needs the
basics people expect on day one: a way to stop someone bothering you, a way for the operator to
act on reports, knowing when someone interacts with you, finding people you know, talking
privately, a faster sign-up, and leaving for good. The owner asked for all of these together.
AGENTS.md lists chat as future scope; the owner explicitly requested direct messages now, so this
ADR records that decision.

## Decision

- **One visibility filter.** `packages/core/src/community.ts` installs `viewFilter` on the social
  service: a post is hidden if it was removed by a moderator, or its owner is suspended, deleted,
  or blocked in either direction. Feeds, profiles, comments, search and messages all go through
  it. A `relationGuard` makes follows, partner requests and messages across a block fail with
  `NOT_AVAILABLE`.
- **Blocking** toggles, removes follows both ways, and is silent: the other person is not told.
  Blocked accounts are listed and can be unblocked from Account settings.
- **Reports** carry a reason (spam, harassment, nudity, violence, pretending, other). The
  moderation queue groups open reports per post or profile; a moderator can remove or restore a
  post, dismiss reports, or suspend an account (which ends its sessions and hides its posts).
  Moderators are the demo user Alex in demo mode and confirmed emails listed in
  `FORMA_ADMIN_EMAILS` in production. Everyone else gets `404` from moderation routes. Admins
  cannot be suspended through the UI and nobody can suspend themselves.
- **Notifications** are written in the same transaction as the action (follow, like, comment,
  sticker, partner request, post removed) with a deterministic id, so repeating an action does
  not create duplicates and undoing it does not leave noise. Self actions never notify. The web
  app polls one cheap `/api/badges` endpoint every 20 seconds for both unread counts.
- **People search** ranks handle prefix, then name word prefix, then substring; suggestions are
  friends of the people you follow, then popular accounts. Blocked, suspended and deleted
  accounts never appear.
- **Messages** are one-to-one text (2000 characters). You can write to someone who follows you or
  who has written to you, which keeps strangers out of inboxes without a request queue. A block,
  suspension or deletion closes the conversation. Limit: 30 messages per minute per sender. The
  web app polls an open conversation every 5 seconds; there is no push channel.
- **Google login** uses the authorization code flow with PKCE and a state value held in a
  short-lived `SameSite=Lax` cookie scoped to `/api/auth/google`. Only Google-verified emails are
  accepted. An existing Forma account is linked only if its email is confirmed; otherwise the user
  must log in with their password first (`EMAIL_NOT_CONFIRMED_FOR_LINKING`), so nobody can take
  over an unconfirmed account by creating a Google account with that address. Google-only
  accounts have no password and can add one through the reset email. The routes return `404`
  until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set.
- **Deleting an account** needs the password (or typing the handle for Google-only accounts),
  then erases sign-in data, sessions, follows, likes, saves, stickers, blocks, notifications,
  chapters, partner links, email proofs and messages, and anonymises the user record
  ("Deleted account"). Posts are hidden immediately by the visibility filter but their records
  remain, so shared post state for other people does not break.

## Consequences

- Polling is simple and works behind any host, at the cost of up to 5–20 seconds of delay and
  some idle requests. Replace with server-sent events when traffic justifies it.
- Hidden posts of deleted accounts still occupy storage until a purge job exists. Data export is
  still missing; both matter for Indonesia's PDP law before a wider launch.
- No push or email notifications yet; activity is only visible inside the app.
- Moderators are configured by environment, not managed in the UI.
