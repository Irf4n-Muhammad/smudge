# 0012 — Real accounts, email delivery and a production mode

Status: accepted.

## Context

The owner wants real people to use Forma: sign up, log in, receive real email, and reach the app
on the internet. Until now identity was a demo convenience (an in-memory session that could
switch to any seeded person), email was an in-app outbox, and every origin was hard-coded to
loopback ports.

## Decision

- `FORMA_MODE` selects `demo` (default, unchanged playground) or `production`. Production refuses
  to start without two distinct `https` origins and a configured mail provider
  (`apps/server/config.ts`), so a misconfigured deploy fails loudly instead of running insecurely.
- `packages/core/src/accounts.ts` owns accounts. Email + password signup (scrypt, per-password
  salt, parameters stored in the hash), login by email or handle with a per-account lockout
  (5 failures / 15 minutes), sessions stored as SHA-256 hashes with a 30-day sliding expiry,
  logout and logout-everywhere, single-use email confirmation (24 h) and reset links (1 h).
  Reset does not reveal whether an email has an account, signs out every device and confirms
  the mailbox. Changing a password keeps only the current device. Handles that read as the
  platform (`admin`, `support`, `forma`, ...) are reserved.
- Sessions moved from process memory into the store, so restarts no longer sign everyone out.
  Demo account switching now creates normal stored sessions.
- Mail uses a transactional outbox (`packages/core/src/mail.ts`): domain code queues a message
  in the same transaction as the change; a worker (`apps/server/mail.ts`) delivers it through
  Resend's HTTP API with an idempotency key and exponential backoff, or to a file for staging.
  Delivered or abandoned messages keep only their envelope; links and codes are erased. The
  in-app inbox is shown only in demo mode.
- CSRF stays covered by `SameSite=Strict` cookies plus a required, allow-listed `Origin` on every
  non-GET request, including the public auth endpoints. Cookies are `Secure` on https.
- Auth endpoints are rate-limited per client IP in memory. In production the edge proxy
  overwrites `x-forma-client-ip`, so clients cannot pick their own bucket.
- `scripts/start.mjs` runs the API, `next start` and a small edge proxy (`scripts/edge.mjs`) that
  serves both hostnames on one port, routing by Host. The post runtime keeps its own origin; its
  CSP `frame-ancestors` is the public origin. The Dockerfile packages this as one container with
  a `/data` volume. Deployment steps: `docs/deploy.md`.
- Production starts with an empty network: demo people, posts, profiles and bundled mods are not
  seeded (`FORMA_DEMO_CONTENT=1` overrides). Stock photos are still seeded for templates.
- The local MCP token is ignored in production; MCP remains a local authoring tool.

## Consequences and limits

One process and one SQLite file: single instance only. No OAuth/social login, two-factor
authentication, account deletion, data export or moderation console yet. `bootstrap` still lists
all users to signed-in clients. The in-memory rate limiter resets on restart. Email confirmation
is encouraged with a banner but does not yet gate any action.
