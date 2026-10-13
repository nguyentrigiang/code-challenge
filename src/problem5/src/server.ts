import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { runMigrations } from "./db/migrate.js";

const config = loadConfig();
const db = openDatabase(config.DB_FILE);
// Apply pending migrations on startup so a fresh clone works with a single command.
runMigrations(db, (msg) => console.log(`[migrate] ${msg}`));
const app = createApp(db, { logRequests: config.NODE_ENV !== "test" });

const server = app.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT} (db: ${config.DB_FILE})`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Force exit if open connections keep the server alive.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
