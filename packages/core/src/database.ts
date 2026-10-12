import initSqlJs from "sql.js";
import type { Database, SqlValue } from "sql.js";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class Store {
  private constructor(
    private db: Database,
    private readonly filename: string,
    private readonly SQL: Awaited<ReturnType<typeof initSqlJs>>,
  ) {}
  static async open(filename: string) {
    const SQL = await initSqlJs();
    const store = new Store(
      new SQL.Database(existsSync(filename) ? readFileSync(filename) : undefined),
      filename,
      SQL,
    );
    store.db.run(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
      INSERT OR IGNORE INTO migrations VALUES(1);
    `);
    return store;
  }
  get<T>(kind: string, id: string): T | undefined {
    const statement = this.db.prepare("SELECT body FROM records WHERE kind=? AND id=?");
    try {
      statement.bind([kind, id]);
      if (!statement.step()) return undefined;
      return JSON.parse(String(statement.get()[0])) as T;
    } finally {
      statement.free();
    }
  }
  all<T>(kind: string): T[] {
    const statement = this.db.prepare("SELECT body FROM records WHERE kind=? ORDER BY rowid");
    try {
      statement.bind([kind]);
      const rows: T[] = [];
      while (statement.step()) rows.push(JSON.parse(String(statement.get()[0])) as T);
      return rows;
    } finally {
      statement.free();
    }
  }
  ids(kind: string): string[] {
    const statement = this.db.prepare("SELECT id FROM records WHERE kind=? ORDER BY rowid");
    try {
      statement.bind([kind]);
      const ids: string[] = [];
      while (statement.step()) ids.push(String(statement.get()[0]));
      return ids;
    } finally {
      statement.free();
    }
  }
  put(kind: string, id: string, value: unknown) {
    this.db.run(
      "INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
      [kind, id, JSON.stringify(value)] as SqlValue[],
    );
  }
  remove(kind: string, id: string) {
    this.db.run("DELETE FROM records WHERE kind=? AND id=?", [kind, id]);
  }
  /** Synchronous transaction + atomic file replacement; one server process owns this store. */
  transaction<T>(work: () => T): T {
    const previous = this.db.export();
    this.db.run("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.run("COMMIT");
      mkdirSync(dirname(this.filename), { recursive: true });
      writeFileSync(this.filename + ".tmp", this.db.export());
      renameSync(this.filename + ".tmp", this.filename);
      return result;
    } catch (error) {
      this.db.close();
      this.db = new this.SQL.Database(previous);
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
