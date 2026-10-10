# Engineering instructions

Read README.md, docs/product.md, and docs/architecture.md before changing product behavior.
Read docs/contracts.md when changing packages, permissions, or operation events.

- Preserve radical customization of layout, interaction, and behavior. Do not reduce the product
  to visual themes or hardcoded templates.
- The first product is a social feed. Chat/community expansion is a future possibility, not scope.
- AI is external. Do not add a model dependency, paid API, cloud account, or deployment unless requested.
- Keep prototype limitations explicit. A manifest validator is not a sandbox or authentication system.
- Shared domain rules belong in packages/core; transport validation belongs at each boundary.
- Never accept actor identity from a post package, MCP argument, or client request body.
- Treat generated code, manifests, and runtime messages as untrusted. Validate them at runtime.
- Keep private content and credentials out of logs, fixtures, commits, and tool output.
- Change versioned contracts deliberately; update docs, compatibility tests, and decision records.
- Add regression tests for meaningful behavior or security changes; avoid tests that only restate code.
- Run npm run check after code changes. Report actual results and any checks not run.
- For UI, runtime, MCP or publication changes, also run the web build and browser E2E suite.
- E2E owns ports 3000-3002 and uses .local/e2e; stop the normal dev instance first.
- Do not delete or reset .local/forma.sqlite to refresh seed content. Use an isolated FORMA_DATA_DIR.
- Document why a non-obvious constraint exists. Keep PRs focused and include reproduction details.
- Do not claim planned components work. Update README status and roadmap as implementation changes.
- No agent delegation is required by this repository.
