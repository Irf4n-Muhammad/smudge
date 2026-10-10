# ADR 0002: Local web, capability runtime and stdio MCP

Date: 2026-10-05

Status: Accepted for the local demo. Supersedes the implementation-status portions of ADR 0001.

## Context

The user authorized the full local path: social feed, custom experiences, persistence, preview,
publication, and external AI authoring through MCP. Paid hosting and public login remain out of scope.

## Decisions

- Next.js/React on port 3000 with explicit webpack extension aliases for shared NodeNext TypeScript.
- One Express process owns the API on 3001 and runtime responses on 3002. All listeners use loopback.
- SQL.js provides SQLite without native compilation or Docker. Small JSON records are stored in
  SQLite and the database file is atomically replaced after transactions. Single-process ownership
  is guarded by an exclusive lock. This is a small local store, not a production database architecture.
- Official MCP SDK with stdio; the adapter forwards to the same API/domain layer as the browser.
  Use the lower-level Server registration API with explicit tool schemas to avoid expensive
  cross-version Zod inference in the high-level registration API. Boundary data is still validated.
- UI simulated account selection produces an opaque server session; package/tool payloads never
  determine identity. Local MCP is separately bound to the Alex account.
- A runtime is a sandboxed iframe with an opaque origin, hosted on port 3002. CSP and permission
  headers are applied by the server, outside user control. Host chrome stays outside the iframe.
- A short-lived ticket binds the frame to user, session, target, preview state and revision. Host
  messages require matching source, null origin, nonce and schema; the server rechecks ticket and
  permissions. It never trusts a post-supplied post ID or actor.
- The schema gains v2 for media, polling and reading contributions; valid v1 packages remain accepted.
- Photo assets are local and embedded as data URLs in runtime responses. No hotlinked runtime assets.
- Plain CSS is used for this small custom interface; no styling framework is needed yet.

## Consequences

The demo runs without service accounts or a model subscription. It supports arbitrary classic
JavaScript interactions within its browser sandbox and declared server capabilities. It does not
support arbitrary backend code, dependency installation, network access, video transcoding, or
public authentication. Local AI clients can author formats that are not in the seed catalog.

An iframe is not a hard CPU/memory boundary. A hostile loop can affect responsiveness; the tested
policy covers DOM/network/capability access, not complete adversarial containment. Post self-navigation
is also not a universally enforceable browser sandbox restriction. Do not deploy for untrusted public
authors without a broader threat review, stronger resource isolation, and abuse controls.

SQLite file export is synchronous and rewrites the entire small database. Move to a native or server
database, normalized schema/indexes, durable transactions and backup operations before large media
libraries or multiple server processes. No claim of power-loss durability is made for this prototype.
