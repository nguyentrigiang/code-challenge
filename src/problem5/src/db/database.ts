import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

/** Opens (and creates if needed) the SQLite database file. Use ":memory:" for tests. */
export function openDatabase(file: string): Database {
  if (file !== ":memory:") {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (file !== ":memory:") {
    // Better read/write concurrency for a file-backed database.
    db.exec("PRAGMA journal_mode = WAL");
  }
  return db;
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
