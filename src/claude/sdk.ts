import { isValidSessionId, truncateSystemPrompt } from "../security/validator.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("claude-sdk");

export interface ClaudeResponse {
  content: string;
  sessionId: string | null;
  cost: number;
  toolsUsed: string[];
  durationMs: number;
  isError: boolean;
}

export interface StreamUpdate {
  type: "tool_start" | "tool_end" | "text" | "thinking" | "error";
  toolName?: string;
  content?: string;
}

/**
 * Claude Code SDK — spawns `claude --print` per message with `--resume`
 * for session continuity. Each invocation picks up the full conversation
 * history from Claude's internal session store.
 */
export class ClaudeSDK {
  constructor(
    private model: string,
    private maxTurns: number,
    private timeoutSeconds: number,
  ) {
    log.info({ model, maxTurns, timeoutSeconds }, "Claude SDK initialized");
  }

  async execute(
    prompt: string,
    workingDirectory: string,
    options: {
      sessionId?: string;
      systemPrompt?: string;
      onStream?: (update: StreamUpdate) => void;
    } = {},
  ): Promise<ClaudeResponse> {
    const startTime = Date.now();
    const toolsUsed: string[] = [];

    try {
      const args = [
        "--print",
        "--verbose",
        "--output-format", "stream-json",
        "--max-turns", String(this.maxTurns),
        "--dangerously-skip-permissions",
      ];

      // Only pass --model if explicitly set
      if (this.model && this.model !== "default") {
        args.push("--model", this.model);
      }

      // Resume existing session for conversation continuity
      if (options.sessionId && isValidSessionId(options.sessionId)) {
        args.push("--resume", options.sessionId);
      }

      // System prompt via --system-prompt flag
      if (options.systemPrompt) {
        const truncated = truncateSystemPrompt(options.systemPrompt);
        args.push("--system-prompt", truncated);
      }

      args.push("--", prompt);

      log.debug({ cwd: workingDirectory, hasResume: !!options.sessionId }, "Spawning claude");

      const proc = Bun.spawn(["claude", ...args], {
        cwd: workingDirectory,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      let resultText = "";
      let sessionId: string | null = null;
      let totalCost = 0;

      // Read streaming JSON output line by line
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);

            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") {
                  resultText = block.text;
                  options.onStream?.({ type: "text", content: block.text });
                } else if (block.type === "tool_use") {
                  toolsUsed.push(block.name);
                  options.onStream?.({
                    type: "tool_start",
                    toolName: block.name,
                    content: block.input ? summarizeToolInput(block.name, block.input) : undefined,
                  });
                } else if (block.type === "thinking") {
                  options.onStream?.({ type: "thinking", content: block.thinking?.slice(0, 100) });
                }
              }
            } else if (event.type === "tool_result") {
              options.onStream?.({
                type: "tool_end",
                toolName: event.tool_name,
              });
            } else if (event.type === "result") {
              resultText = event.result ?? resultText;
              sessionId = event.session_id ?? null;
              totalCost = event.total_cost_usd ?? event.cost_usd ?? 0;
            }
          } catch {
            // Non-JSON line — ignore (hook output, etc.)
          }
        }
      }

      const exitCode = await proc.exited;

      if (exitCode !== 0 && !resultText) {
        const stderr = await new Response(proc.stderr).text();
        log.warn({ exitCode, stderr: stderr.slice(0, 500) }, "Claude exited with error");
        resultText = stderr || `Claude exited with code ${exitCode}`;
      }

      log.debug({ sessionId, cost: totalCost, tools: toolsUsed.length, ms: Date.now() - startTime }, "Claude response");

      return {
        content: resultText,
        sessionId,
        cost: totalCost,
        toolsUsed: [...new Set(toolsUsed)],
        durationMs: Date.now() - startTime,
        isError: exitCode !== 0 && !resultText,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      log.error({ error: message }, "Claude SDK execution failed");

      return {
        content: `Error: ${message}`,
        sessionId: null,
        cost: 0,
        toolsUsed,
        durationMs: Date.now() - startTime,
        isError: true,
      };
    }
  }
}

/** Summarize tool input for live display — e.g. "Read → src/index.ts" */
function summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
      return String(input.file_path ?? "").split("/").slice(-2).join("/");
    case "Write":
    case "Edit":
      return String(input.file_path ?? "").split("/").slice(-2).join("/");
    case "Bash":
      return String(input.command ?? "").slice(0, 60);
    case "Glob":
      return String(input.pattern ?? "");
    case "Grep":
      return String(input.pattern ?? "").slice(0, 40);
    case "WebSearch":
      return String(input.query ?? "").slice(0, 50);
    case "WebFetch":
      return String(input.url ?? "").slice(0, 60);
    case "Agent":
      return String(input.description ?? "").slice(0, 50);
    default:
      return "";
  }
}
