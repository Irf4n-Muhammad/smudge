import type { Store } from "./database.js";

/**
 * Whether people come back: the days each signed-in account opened Smudge. One record per account
 * per day, nothing about what they did. The report gives counts only, never who.
 */
const DAY = 86400000;
const day = (at: number | Date) => new Date(at).toISOString().slice(0, 10);

/** Marks an account as active today. Held in memory and written in batches. */
export class ActiveDays {
  private pending = new Set<string>();
  private written = new Set<string>();
  constructor(private readonly store: Store) {}
  mark(userId: string, at = new Date()) {
    const key = `${userId}:${day(at)}`;
    if (!this.written.has(key)) this.pending.add(key);
  }
  flush() {
    if (!this.pending.size) return;
    const batch = this.pending;
    this.pending = new Set();
    this.store.transaction(() => {
      for (const key of batch)
        if (!this.store.get("active-day", key)) this.store.put("active-day", key, {});
    });
    // Only today's keys can repeat, so yesterday's are forgotten to keep memory flat.
    const today = day(Date.now());
    for (const key of this.written) if (!key.endsWith(today)) this.written.delete(key);
    for (const key of batch) this.written.add(key);
  }
}

export interface HabitWeek {
  week: number;
  /** Accounts old enough to have lived through this whole week. */
  accounts: number;
  /** Of those, how many opened Smudge on 4 or more days of that week. */
  habitual: number;
}

/**
 * The number Fase 0 set: of the accounts that are at least four weeks old, how many opened
 * Smudge on 4 or more days in their fourth week. Weeks 1 to 3 are shown too, to see the slope.
 */
export function habitReport(store: Store, now = Date.now()): HabitWeek[] {
  const days = new Map<string, Set<string>>();
  for (const key of store.ids("active-day")) {
    const at = key.lastIndexOf(":");
    const userId = key.slice(0, at);
    if (!days.has(userId)) days.set(userId, new Set());
    days.get(userId)!.add(key.slice(at + 1));
  }
  const weeks: HabitWeek[] = [1, 2, 3, 4].map((week) => ({ week, accounts: 0, habitual: 0 }));
  for (const userId of store.ids("credential")) {
    const created = Date.parse(store.get<{ createdAt: string }>("credential", userId)!.createdAt);
    if (!Number.isFinite(created)) continue;
    const start = Date.parse(day(created));
    const seen = days.get(userId) ?? new Set();
    for (const w of weeks) {
      const from = start + (w.week - 1) * 7 * DAY;
      if (from + 7 * DAY > now) continue;
      w.accounts++;
      let n = 0;
      for (let d = 0; d < 7; d++) if (seen.has(day(from + d * DAY))) n++;
      if (n >= 4) w.habitual++;
    }
  }
  return weeks;
}

export function formatHabitReport(weeks: HabitWeek[]): string[] {
  return weeks.map(({ week, accounts, habitual }) =>
    accounts
      ? `Week ${week}: ${habitual} of ${accounts} accounts opened Smudge on 4+ days (${Math.round((habitual / accounts) * 100)}%)`
      : `Week ${week}: no account is old enough yet`,
  );
}
