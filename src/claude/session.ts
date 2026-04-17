import { nanoid } from "nanoid";
import type { SessionRepository } from "../storage/repositories.js";
import { createChildLogger } from "../utils/logger.js";
import { MAX_SESSIONS_PER_USER, SESSION_TIMEOUT_HOURS } from "../utils/constants.js";

const log = createChildLogger("session");

export class SessionManager {
  constructor(private repo: SessionRepository) {}

  async getOrCreate(
    userId: number,
    projectPath: string,
  ): Promise<{ id: string; claudeSessionId: string | null; isNew: boolean }> {
    // Try to find active session for this user + project
    const existing = this.repo.findActive(userId, projectPath);

    if (existing) {
      // Check if expired
      const lastActivity = new Date(existing.lastActivity).getTime();
      const expiryMs = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;

      if (Date.now() - lastActivity < expiryMs) {
        log.debug(
          { sessionId: existing.id, claudeSessionId: existing.claudeSessionId },
          "Resuming existing session",
        );
        return {
          id: existing.id,
          claudeSessionId: existing.claudeSessionId,
          isNew: false,
        };
      }

      // Expire old session
      this.repo.expire(existing.id);
      log.info({ sessionId: existing.id }, "Session expired");
    }

    // Create new session
    const id = nanoid();
    this.repo.create({
      id,
      userId,
      projectPath,
      claudeSessionId: null,
      status: "active",
      totalCost: 0,
      totalTurns: 0,
    });

    log.info({ sessionId: id, userId, projectPath }, "New session created");
    return { id, claudeSessionId: null, isNew: true };
  }

  assignClaudeSession(sessionId: string, claudeSessionId: string): void {
    this.repo.updateClaudeSessionId(sessionId, claudeSessionId);
    log.debug({ sessionId, claudeSessionId }, "Claude session ID assigned");
  }

  recordTurn(sessionId: string, cost: number): void {
    this.repo.updateActivity(sessionId, cost);
  }

  resetSession(userId: number, projectPath: string): void {
    const existing = this.repo.findActive(userId, projectPath);
    if (existing) {
      this.repo.expire(existing.id);
      log.info({ sessionId: existing.id }, "Session reset by user");
    }
  }
}
