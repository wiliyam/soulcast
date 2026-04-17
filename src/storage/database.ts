import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("database");

const MIGRATIONS = [
  // Migration 1: Core tables
  `CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    telegram_username TEXT,
    first_seen TEXT DEFAULT (datetime('now')),
    last_active TEXT DEFAULT (datetime('now')),
    is_allowed INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    project_path TEXT NOT NULL,
    claude_session_id TEXT,
    status TEXT DEFAULT 'active',
    total_cost REAL DEFAULT 0,
    total_turns INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    last_activity TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    cost REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    tools_used TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);`,

  // Migration 2: Memory tables
  `CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'fact',
    content TEXT NOT NULL,
    source TEXT DEFAULT 'conversation',
    importance REAL DEFAULT 0.5,
    created_at TEXT DEFAULT (datetime('now')),
    last_accessed TEXT DEFAULT (datetime('now')),
    access_count INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_memory_user ON memory(user_id);
  CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(type);`,

  // Migration 3: Scheduled jobs
  `CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    prompt TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    is_active INTEGER DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    run_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_active ON scheduled_jobs(is_active);`,
];

export class DatabaseManager {
  private db: Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  initialize(): void {
    const version = this.getSchemaVersion();
    for (let i = version; i < MIGRATIONS.length; i++) {
      log.info({ migration: i + 1 }, "Running migration");
      this.db.exec(MIGRATIONS[i]);
    }
    this.setSchemaVersion(MIGRATIONS.length);
    log.info("Database initialized");
  }

  private getSchemaVersion(): number {
    try {
      const row = this.db.query("PRAGMA user_version").get() as {
        user_version: number;
      };
      return row.user_version;
    } catch {
      return 0;
    }
  }

  private setSchemaVersion(version: number): void {
    this.db.exec(`PRAGMA user_version = ${version}`);
  }

  get raw(): Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
