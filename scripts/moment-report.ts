import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { formatMomentReport, momentReport } from "../packages/core/src/moment-report.js";

// The test wedding's numbers (work plan, stage 5): npm run moment-report -- <moment id> [--invited N]
// Reads a copy of the database, so it is safe while the server runs and never changes anything.
const [id, ...rest] = process.argv.slice(2);
const at = rest.indexOf("--invited");
const invited = at >= 0 ? Number(rest[at + 1]) : undefined;
if (!id || (invited !== undefined && !(invited > 0))) {
  console.error("Usage: npm run moment-report -- <moment id> [--invited N]");
  process.exit(1);
}
const source = resolve(process.env.FORMA_DATA_DIR ?? ".local", "forma.sqlite");
if (!existsSync(source)) {
  console.error(`No database at ${source}. Set FORMA_DATA_DIR to the server's data directory.`);
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), "moment-report-"));
try {
  const copy = join(dir, "forma.sqlite");
  copyFileSync(source, copy);
  const store = await Store.open(copy);
  for (const line of formatMomentReport(momentReport(store, id, invited))) console.log(line);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
