import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig } from "../config.js";
import { openDatabase, transaction, type Database } from "./database.js";

// Same relative location from both src/db (tsx) and dist/db (compiled).
const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url));

/**
 * Minimal forward-only migration runner.
 * Applies every `*.sql` file in /migrations (sorted by name) that is not yet
 * recorded in the `schema_migrations` table. SQLite DDL is transactional, so each
 * migration is applied completely or not at all.
 */
export function runMigrations(db: Database, log: (msg: string) => void = () => {}): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedRows = db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[];
  const alreadyApplied = new Set(appliedRows.map((row) => row.name));
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort(); // 001_..., 002_..., applied in order

  for (const file of migrationFiles) {
    if (alreadyApplied.has(file)) {
      continue;
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    transaction(db, () => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
    });
    log(`applied ${file}`);
  }
}

// Allow `npm run migrate` to execute this file directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const db = openDatabase(config.DB_FILE);
  try {
    runMigrations(db, (msg) => console.log(`[migrate] ${msg}`));
    console.log(`[migrate] ${config.DB_FILE} is up to date`);
  } finally {
    db.close();
  }
}
