import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { ActiveDays, formatHabitReport, habitReport } from "../packages/core/src/habit-report.js";

const at = (d: string) => new Date(`${d}T12:00:00Z`);

test("the habit report counts accounts that open Smudge on 4+ days in a week, without names", async () => {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-habit-")), "db.sqlite"));
  store.transaction(() => {
    store.put("credential", "rani", { createdAt: "2026-10-01T09:00:00Z" });
    store.put("credential", "leo", { createdAt: "2026-10-01T22:00:00Z" });
    // Too new to have lived through week 2.
    store.put("credential", "ines", { createdAt: "2026-11-01T09:00:00Z" });
  });
  const active = new ActiveDays(store);
  // Rani: four days in week 1 (one of them twice), four days in week 4.
  for (const d of ["2026-10-01", "2026-10-02", "2026-10-02", "2026-10-04", "2026-10-07"])
    active.mark("rani", at(d));
  for (const d of ["2026-10-22", "2026-10-23", "2026-10-25", "2026-10-28"])
    active.mark("rani", at(d));
  // Leo: three days in week 1, and the 8th is already week 2.
  for (const d of ["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-08"])
    active.mark("leo", at(d));
  active.flush();
  active.mark("ines", at("2026-11-02"));
  active.flush();

  const weeks = habitReport(store, Date.parse("2026-11-09T00:00:00Z"));
  assert.deepEqual(weeks, [
    { week: 1, accounts: 3, habitual: 1 },
    { week: 2, accounts: 2, habitual: 0 },
    { week: 3, accounts: 2, habitual: 0 },
    { week: 4, accounts: 2, habitual: 1 },
  ]);
  assert.equal(store.ids("active-day").length, 13);
  const lines = formatHabitReport(weeks).join("\n");
  assert.match(lines, /Week 4: 1 of 2 accounts opened Smudge on 4\+ days \(50%\)/);
  assert.doesNotMatch(lines, /rani|leo|ines/);
});
