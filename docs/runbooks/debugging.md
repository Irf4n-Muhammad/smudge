# Local debugging runbook

## Start or install fails

Run `node --version`, `npm --version`, then `npm ci` in the repository root. Use npm.cmd on
PowerShell if npm.ps1 is blocked. `npm run dev` must start all three ports: 3000, 3001, 3002.
Do not delete package-lock.json to hide installation errors.

If a port is occupied, identify the owning process before stopping anything. The database lock
prevents two API processes from writing the same file. Normal shutdown removes it; after a crash,
startup checks whether its PID is still alive. Do not remove a lock belonging to a live server.

`npm run test:e2e` starts a separate instance on the same ports. Stop the development instance first.
Its database is `.local/e2e/forma.sqlite`, separate from your work in `.local/forma.sqlite`.

## A post is blank or reports an error

1. Find the runtime request in browser Network and inspect the error/trace ID.
2. Match the full trace ID to the terminal JSON event. Log route patterns, not credential-bearing URLs.
3. Check the frame request on port 3002, CSP violations, then the post frame's console.
4. Validate the package, local filenames, asset declarations and capability names.
5. Retry the host-owned control. Skip must remain available outside the iframe.
6. Minimize into a synthetic test package; do not relax sandbox policy to make arbitrary code work.

Only near-viewport iframes exist. Offscreen placeholders are deliberate. Tests must scroll to a
post or filter its format before expecting the inner frame to render. The 12-second load timeout
cannot rescue a browser main thread blocked by a hostile infinite loop; that remains a limitation.

Native form submission is blocked by CSP, but JS submit handlers are supported by allow-forms.
External imports, fetch, workers and iframes are intentionally unavailable inside posts.

## Data, permission or publish failures

- NOT_FOUND for a draft can mean it belongs to another account; the error does not disclose ownership.
- MCP always acts as Alex. Select Alex in the browser before opening an MCP draft link.
- REVISION_CONFLICT means read the latest draft before applying changes; never silently overwrite.
- CONTRIBUTOR_REQUIRED means the viewer is not in the creator's contributor list.
- CAPABILITY_DENIED means the package did not declare that operation.
- PREVIEW_STALE means save/reload the preview after editing its draft.
- RUNTIME_EXPIRED means reload the post; tickets expire or are revoked on account switch.
- Server restart clears sessions. The browser returns to Alex while saved data remains intact.

Progress, votes and preview state are deliberately separated by viewer/post or draft revision.
Publishing the same revision returns its existing post; publishing a later revision creates a new one.

## Reproduce and verify

Use `npm run check` for contracts/core and `npm run test:e2e` for browser + MCP behavior. E2E failures
retain traces in test-results; use `npx playwright show-trace <trace.zip>`. Capture app/runtime version,
package digest, trace ID, browser/viewport, expected behavior and a synthetic reproduction.
Never attach real credentials, private text/media, or the entire SQLite file to a bug report.

The generated local token is not printed. A missing token generally means the server has not run
yet, or the MCP launcher points to the wrong data directory. Refer to docs/mcp.md.

## Backup and recovery

There is no production restore command. Stop all local servers, copy the SQLite file to a safe
location, and verify the copied file before replacing any working data. Preserve the original.
The local store exports SQLite synchronously; large datasets require a different persistence design.
Seed content is installed once per database. Editing seed.ts does not rewrite existing publications.
Use a new isolated FORMA_DATA_DIR when testing new seed content, rather than deleting user work.
