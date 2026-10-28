# Contributing

## First contribution

Follow the README setup, open the feed and studio, then trace a draft request from
apps/server/index.ts through packages/core/src/social.ts. Read their tests before changing behavior.
No private user data is needed for development.

## Make a change

1. Describe the concrete problem and reproduction, including expected versus actual behavior.
2. Put domain rules in core and versioned shapes in contracts. Web/MCP must share the same API rules.
3. Add a focused regression for permissions, compatibility, persistence, or behavior changes.
4. Do not write documentation (README, roadmap, docs/ pages or ADRs) unless the owner asks for it.
5. Run `npm run check`. For UI, runtime, transport or publication changes, also run
   `npm run build:web` and `npm run test:e2e` with development servers stopped.
6. Submit a focused diff with checks actually run, limitations, and rollback considerations.

## Code conventions

- Strict TypeScript, explicit boundary types, runtime validation for external data.
- Use domain names such as draft, published post, package, capability, and actor consistently.
- Pass trusted identity separately from request payloads. UI hiding is not authorization.
- Prefer small explicit modules. Introduce an abstraction when there is a real second use case.
- Comments explain constraints and intent; code should express ordinary mechanics.
- Error codes are stable machine-readable values. Do not return stacks, secrets, or raw private input.
- Use allowlisted structured events. Any new logged field needs a privacy review in the PR.

## Dependencies and generated files

Use npm and commit package-lock.json with dependency changes. Do not commit node_modules or dist.
Review dependency changes deliberately; do not run automatic force-upgrade fixes blindly.
The optional FORMA_DATA_DIR environment variable selects an isolated local database/token directory.
Never commit .local, credential files, user media or generated test traces. No paid service keys are
required. Select a supported Node release before deployment.

## Contracts, database, and releases

Follow docs/contracts.md for protocol changes. Database changes must include versioned
migrations and a forward/rollback strategy; test on synthetic local data before rollout.
Avoid destructive migrations in the same release that removes old application behavior.
Published artifacts must remain immutable. Rollback must select a prior artifact, not overwrite it.

No production release process exists yet. Before deployment, define artifact/version identification,
feature disable controls, retention, operational ownership, and a tested recovery procedure.

## Ownership

Current ownership is by module responsibility, not invented team names. Future maintainers should
add CODEOWNERS with real GitHub handles when a repository and reviewers exist. Changes to contracts
and runtime permissions need review by whoever owns both producer and consumer behavior.
