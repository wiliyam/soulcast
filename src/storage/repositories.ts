import type { Database } from "bun:sqlite";
import type {
  MemoryEntry,
  MessageModel,
  ScheduledJob,
  SessionModel,
  UserModel,
} from "./models.js";

export class UserRepository {
  constructor(private db: Database) {}

  upsert(userId: number, username: string | null): void {
    this.db
      .query(
        `INSERT INTO users (user_id, telegram_username, is_allowed)
       VALUES (?1, ?2, 0)
       ON CONFLICT(user_id) DO UPDATE SET
         telegram_username = ?2,
         last_active = datetime('now')`,
      )
      .run(userId, username);
  }

  findById(userId: number): UserModel | null {
    const row = this.db
      .query("SELECT * FROM users WHERE user_id = ?1")
      .get(userId) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      userId: row.user_id as number,
      telegramUsername: row.telegram_username as string | null,
      firstSeen: row.first_seen as string,
      lastActive: row.last_active as string,
      isAllowed: (row.is_allowed as number) === 1,
      totalCost: row.total_cost as number,
    };
  }

  updateActivity(userId: number): void {
    this.db
      .query("UPDATE users SET last_active = datetime('now') WHERE user_id = ?1")
      .run(userId);
  }
}

export class SessionRepository {
  constructor(private db: Database) {}

  create(session: Omit<SessionModel, "createdAt" | "lastActivity">): void {
    this.db
      .query(
        `INSERT INTO sessions (id, user_id, project_path, claude_session_id, status, total_cost, total_turns)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .run(
        session.id,
        session.userId,
        session.projectPath,
        session.claudeSessionId,
        session.status,
        session.totalCost,
        session.totalTurns,
      );
  }

  findActive(userId: number, projectPath: string): SessionModel | null {
    const row = this.db
      .query(
        `SELECT * FROM sessions
       WHERE user_id = ?1 AND project_path = ?2 AND status = 'active'
       ORDER BY last_activity DESC LIMIT 1`,
      )
      .get(userId, projectPath) as Record<string, unknown> | null;
    return row ? this.mapRow(row) : null;
  }

  findById(id: string): SessionModel | null {
    const row = this.db
      .query("SELECT * FROM sessions WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    return row ? this.mapRow(row) : null;
  }

  updateClaudeSessionId(id: string, claudeSessionId: string): void {
    this.db
      .query(
        `UPDATE sessions SET claude_session_id = ?2, last_activity = datetime('now')
       WHERE id = ?1`,
      )
      .run(id, claudeSessionId);
  }

  updateActivity(id: string, cost: number): void {
    this.db
      .query(
        `UPDATE sessions SET
        total_turns = total_turns + 1,
        total_cost = total_cost + ?2,
        last_activity = datetime('now')
       WHERE id = ?1`,
      )
      .run(id, cost);
  }

  expire(id: string): void {
    this.db
      .query("UPDATE sessions SET status = 'expired' WHERE id = ?1")
      .run(id);
  }

  private mapRow(row: Record<string, unknown>): SessionModel {
    return {
      id: row.id as string,
      userId: row.user_id as number,
      projectPath: row.project_path as string,
      claudeSessionId: row.claude_session_id as string | null,
      status: row.status as SessionModel["status"],
      totalCost: row.total_cost as number,
      totalTurns: row.total_turns as number,
      createdAt: row.created_at as string,
      lastActivity: row.last_activity as string,
    };
  }
}

export class MessageRepository {
  constructor(private db: Database) {}

  create(msg: Omit<MessageModel, "id" | "createdAt">): void {
    this.db
      .query(
        `INSERT INTO messages (session_id, user_id, role, content, cost, duration_ms, tools_used)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .run(
        msg.sessionId,
        msg.userId,
        msg.role,
        msg.content,
        msg.cost,
        msg.durationMs,
        JSON.stringify(msg.toolsUsed),
      );
  }

  findBySession(sessionId: string, limit = 50): MessageModel[] {
    const rows = this.db
      .query(
        "SELECT * FROM messages WHERE session_id = ?1 ORDER BY created_at DESC LIMIT ?2",
      )
      .all(sessionId, limit) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as number,
      sessionId: row.session_id as string,
      userId: row.user_id as number,
      role: row.role as "user" | "assistant",
      content: row.content as string,
      cost: row.cost as number,
      durationMs: row.duration_ms as number,
      toolsUsed: JSON.parse((row.tools_used as string) || "[]"),
      createdAt: row.created_at as string,
    }));
  }
}

export class MemoryRepository {
  constructor(private db: Database) {}

  add(
    userId: number,
    type: MemoryEntry["type"],
    content: string,
    source = "conversation",
    importance = 0.5,
  ): void {
    this.db
      .query(
        `INSERT INTO memory (user_id, type, content, source, importance)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .run(userId, type, content, source, importance);
  }

  search(userId: number, query: string, limit = 10): MemoryEntry[] {
    const rows = this.db
      .query(
        `SELECT * FROM memory
       WHERE user_id = ?1 AND content LIKE '%' || ?2 || '%'
       ORDER BY importance DESC, last_accessed DESC
       LIMIT ?3`,
      )
      .all(userId, query, limit) as Record<string, unknown>[];

    return rows.map((row) => this.mapRow(row));
  }

  getRecent(userId: number, limit = 20): MemoryEntry[] {
    const rows = this.db
      .query(
        `SELECT * FROM memory WHERE user_id = ?1
       ORDER BY created_at DESC LIMIT ?2`,
      )
      .all(userId, limit) as Record<string, unknown>[];

    return rows.map((row) => this.mapRow(row));
  }

  touch(id: number): void {
    this.db
      .query(
        `UPDATE memory SET
        last_accessed = datetime('now'),
        access_count = access_count + 1
       WHERE id = ?1`,
      )
      .run(id);
  }

  private mapRow(row: Record<string, unknown>): MemoryEntry {
    return {
      id: row.id as number,
      userId: row.user_id as number,
      type: row.type as MemoryEntry["type"],
      content: row.content as string,
      source: row.source as string,
      importance: row.importance as number,
      createdAt: row.created_at as string,
      lastAccessed: row.last_accessed as string,
      accessCount: row.access_count as number,
    };
  }
}

export class AuditRepository {
  constructor(private db: Database) {}

  log(userId: number | null, action: string, details?: string): void {
    this.db
      .query(
        "INSERT INTO audit_log (user_id, action, details) VALUES (?1, ?2, ?3)",
      )
      .run(userId, action, details ?? null);
  }
}

export class JobRepository {
  constructor(private db: Database) {}

  create(job: Omit<ScheduledJob, "lastRun" | "nextRun" | "runCount" | "createdAt">): void {
    this.db
      .query(
        `INSERT INTO scheduled_jobs (id, name, cron_expression, prompt, user_id, chat_id, timezone, is_active)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .run(
        job.id,
        job.name,
        job.cronExpression,
        job.prompt,
        job.userId,
        job.chatId,
        job.timezone,
        job.isActive ? 1 : 0,
      );
  }

  findActive(): ScheduledJob[] {
    const rows = this.db
      .query("SELECT * FROM scheduled_jobs WHERE is_active = 1")
      .all() as Record<string, unknown>[];

    return rows.map((row) => this.mapRow(row));
  }

  updateLastRun(id: string): void {
    this.db
      .query(
        `UPDATE scheduled_jobs SET
        last_run = datetime('now'),
        run_count = run_count + 1
       WHERE id = ?1`,
      )
      .run(id);
  }

  deactivate(id: string): void {
    this.db
      .query("UPDATE scheduled_jobs SET is_active = 0 WHERE id = ?1")
      .run(id);
  }

  private mapRow(row: Record<string, unknown>): ScheduledJob {
    return {
      id: row.id as string,
      name: row.name as string,
      cronExpression: row.cron_expression as string,
      prompt: row.prompt as string,
      userId: row.user_id as number,
      chatId: row.chat_id as number,
      timezone: row.timezone as string,
      isActive: (row.is_active as number) === 1,
      lastRun: row.last_run as string | null,
      nextRun: row.next_run as string | null,
      runCount: row.run_count as number,
      createdAt: row.created_at as string,
    };
  }
}
