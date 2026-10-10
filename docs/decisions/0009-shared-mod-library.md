# 0009 — Immutable local mods and owner-bound profile polls

Status: accepted.

## Context

Reusable customization needs an explicit distribution path: author, share, try, mix and publish.
Giving another account the source must not transfer account identity, private media references,
or accumulated interactions. A second example must demonstrate behavior as well as layout.

## Decision

Use a local public library of immutable mod versions with explicit selected slots. The owner shares
source and declared dependencies from an owned draft at a checked revision. Source and all declared
media are disclosed as shared. Media copies receive separate version-owned IDs; installation copies
them into the new owner's namespace in the same transaction as the private draft. Identity, posts,
drawings and votes are not copied. No live profile is published by installation.
Repeatedly mixing the same edition into the same draft reuses its copied asset IDs, so identical
dependency files stay identical and do not create artificial filename conflicts.

Maintain latest records separately from version snapshots. Actor-bound submission IDs make sharing
retryable; expectedVersion protects updates. Keep installations pinned, and reject file collisions
instead of overwriting unrelated mod source. The host renders metadata as text and previews executable
source only in the existing isolated runtime. Validation is not proof of safety or per-mod isolation.

After Hours is ordinary source, with four self-contained fragments and a compatible shared shell.
Its voting feature uses optional v2 poll metadata and two new grants. A vote is owned by the ticket
actor; public storage is keyed by owner and definition hash, practice storage by draft/revision.
Return aggregates and only the caller's selection. Require the active definition and grant for old
publication tickets, so removed/reconfigured widgets cannot keep accepting votes.

## Consequences

Old profile packages remain valid; the poll and library contracts are additive. Mixing arbitrary
code still requires compatible dependencies/styles, with no separate permission sandbox per part.
Partial sharing includes inactive source files/assets; UI and MCP disclose this explicitly. Built-in
library revisions may advance on source changes, but existing installations/publications stay pinned.
The library is local and has no payments, licensing enforcement, unsharing/revocation, production
moderation or remote login. No model dependency or hosted service is introduced.
