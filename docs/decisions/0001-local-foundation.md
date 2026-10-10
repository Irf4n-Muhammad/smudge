# ADR 0001: Local TypeScript foundation before external infrastructure

Date: 2026-10-05

Status: Accepted for this foundation; runtime and hosting choices remain proposals.

## Context

The product allows radical customization of social posts through external AI tools, initially via
MCP. The user requested engineering practices that make the next engineer's work understandable
and reproducible, with no paid infrastructure needed to start. The workspace was empty.

## Decision

Use a single npm project with strict TypeScript, Zod boundary contracts, Node's built-in test runner,
Prettier, and a cross-platform GitHub Actions workflow. Put shared behavior in core and explicit
schemas in contracts. Use synthetic in-memory data until persistence is needed.

Provide a runnable domain example rather than empty implementations of authentication, sandboxing,
or MCP. Document current versus planned behavior in the README and architecture guide.
Do not initialize a remote repository, configure cloud services, or deploy as part of this work.

## Consequences

Setup is small and requires no service credentials. A future web/MCP adapter has one place to call
publication rules. Browser behavior, durable data, distributed tracing, and actual identity remain
unproven. This foundation must not be exposed as a public service.

When independently deployed applications are introduced, reconsider npm workspaces and per-package
build outputs. A modular layout does not require microservices or a workspace orchestrator today.

## Alternatives

- Full Next.js/Supabase/MCP scaffold immediately: more dependencies and setup before boundary rules
  are clear; defer until building the first complete product path.
- Documentation only: easier initially, but would leave no executable example of the intended rules.
- Microservices: adds distributed failure and deployment concerns without current demand.
