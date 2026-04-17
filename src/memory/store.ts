import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MemoryRepository } from "../storage/repositories.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("memory");

/**
 * Persistent memory system — OpenClaw-style MEMORY.md + daily notes.
 *
 * Memory types:
 *   - fact: Learned facts about the user/project
 *   - preference: User preferences and working style
 *   - decision: Important decisions made in conversations
 *   - context: Ongoing project context
 *   - task: Recurring or remembered tasks
 *
 * Storage:
 *   - SQLite for searchable structured memory
 *   - MEMORY.md for human-readable persistent context (loaded at session start)
 *   - Daily notes (YYYY-MM-DD.md) for conversation summaries
 */
export class MemoryStore {
  private memoryDir: string;

  constructor(
    memoryDir: string,
    private repo: MemoryRepository,
  ) {
    this.memoryDir = resolve(memoryDir);
    mkdirSync(this.memoryDir, { recursive: true });
  }

  /** Add a memory entry to both SQLite and MEMORY.md */
  remember(
    userId: number,
    content: string,
    type: "fact" | "preference" | "decision" | "context" | "task" = "fact",
    importance = 0.5,
  ): void {
    // Store in SQLite for search
    this.repo.add(userId, type, content, "conversation", importance);

    // Append to MEMORY.md for session-start loading
    const memoryPath = resolve(this.memoryDir, "MEMORY.md");
    const timestamp = new Date().toISOString().split("T")[0];
    const entry = `\n- [${timestamp}] (${type}) ${content}`;

    if (existsSync(memoryPath)) {
      const existing = readFileSync(memoryPath, "utf-8");
      writeFileSync(memoryPath, existing + entry);
    } else {
      writeFileSync(
        memoryPath,
        `# Memory\n\nPersistent facts and context.\n${entry}`,
      );
    }

    log.info({ userId, type }, "Memory stored");
  }

  /** Search memories by keyword */
  search(userId: number, query: string): string[] {
    const results = this.repo.search(userId, query, 10);
    // Touch accessed memories to track relevance
    for (const r of results) {
      this.repo.touch(r.id);
    }
    return results.map((r) => r.content);
  }

  /** Get recent memories for context injection */
  getRecent(userId: number, limit = 20): string[] {
    return this.repo.getRecent(userId, limit).map((r) => r.content);
  }

  /** Load MEMORY.md content for system prompt injection */
  loadMemoryFile(): string {
    const memoryPath = resolve(this.memoryDir, "MEMORY.md");
    if (existsSync(memoryPath)) {
      return readFileSync(memoryPath, "utf-8").trim();
    }
    return "";
  }

  /** Get today's daily note */
  getDailyNote(): string {
    const today = new Date().toISOString().split("T")[0];
    const notePath = resolve(this.memoryDir, `${today}.md`);
    if (existsSync(notePath)) {
      return readFileSync(notePath, "utf-8").trim();
    }
    return "";
  }

  /** Append to today's daily note */
  appendDailyNote(content: string): void {
    const today = new Date().toISOString().split("T")[0];
    const notePath = resolve(this.memoryDir, `${today}.md`);

    if (existsSync(notePath)) {
      const existing = readFileSync(notePath, "utf-8");
      writeFileSync(notePath, `${existing}\n${content}`);
    } else {
      writeFileSync(notePath, `# ${today}\n\n${content}`);
    }
  }
}
