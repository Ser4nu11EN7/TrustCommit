import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(dbPath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      output_schema_json TEXT NOT NULL,
      reward INTEGER NOT NULL,
      required_stake INTEGER NOT NULL,
      deadline_ts INTEGER NOT NULL,
      status TEXT NOT NULL,
      covenant_id TEXT,
      executor_agent_id INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      proof_hash TEXT,
      task_hash TEXT,
      artifact_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_role TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT,
      log_path TEXT,
      output_json TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chain_actions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  ensureColumn(db, "runs", "input_json", "TEXT");
  ensureColumn(db, "runs", "log_path", "TEXT");
  return db;
}

function ensureColumn(db: DatabaseSync, tableName: string, columnName: string, columnType: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType};`);
  }
}
