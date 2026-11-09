import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { formatHabitReport, habitReport } from "../packages/core/src/habit-report.js";

// How many accounts open Smudge on 4+ days a week, by week since sign-up: npm run habit-report
// Reads a copy of the database, so it is safe while the server runs and never changes anything.
const source = resolve(process.env.FORMA_DATA_DIR ?? ".local", "forma.sqlite");
if (!existsSync(source)) {
  console.error(`No database at ${source}. Set FORMA_DATA_DIR to the server's data directory.`);
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), "habit-report-"));
try {
  const copy = join(dir, "forma.sqlite");
  copyFileSync(source, copy);
  const store = await Store.open(copy);
  for (const line of formatHabitReport(habitReport(store))) console.log(line);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
