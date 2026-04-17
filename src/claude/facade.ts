import type { MessageRepository } from "../storage/repositories.js";
import { createChildLogger } from "../utils/logger.js";
import type { ClaudeResponse, ClaudeSDK, StreamUpdate } from "./sdk.js";
import type { SessionManager } from "./session.js";

const log = createChildLogger("claude");

export class ClaudeIntegration {
  constructor(
    private sdk: ClaudeSDK,
    private sessions: SessionManager,
    private messages: MessageRepository,
  ) {}

  async runCommand(
    prompt: string,
    userId: number,
    projectPath: string,
    options: {
      systemPrompt?: string;
      onStream?: (update: StreamUpdate) => void;
    } = {},
  ): Promise<ClaudeResponse> {
    // Get or create session with auto-resume
    const session = await this.sessions.getOrCreate(userId, projectPath);

    log.info(
      {
        userId,
        sessionId: session.id,
        isNew: session.isNew,
        hasClaudeSession: !!session.claudeSessionId,
      },
      "Running command",
    );

    // Execute via SDK
    const response = await this.sdk.execute(prompt, projectPath, {
      sessionId: session.claudeSessionId ?? undefined,
      systemPrompt: options.systemPrompt,
      onStream: options.onStream,
    });

    // Assign Claude session ID if new
    if (response.sessionId && !session.claudeSessionId) {
      this.sessions.assignClaudeSession(session.id, response.sessionId);
    }

    // Record turn
    this.sessions.recordTurn(session.id, response.cost);

    // Store messages
    this.messages.create({
      sessionId: session.id,
      userId,
      role: "user",
      content: prompt,
      cost: 0,
      durationMs: 0,
      toolsUsed: [],
    });

    this.messages.create({
      sessionId: session.id,
      userId,
      role: "assistant",
      content: response.content,
      cost: response.cost,
      durationMs: response.durationMs,
      toolsUsed: response.toolsUsed,
    });

    return response;
  }

  resetSession(userId: number, projectPath: string): void {
    this.sessions.resetSession(userId, projectPath);
  }
}
