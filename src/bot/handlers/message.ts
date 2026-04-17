import type { Context } from "grammy";
import type { ClaudeIntegration } from "../../claude/facade.js";
import type { MemoryStore } from "../../memory/store.js";
import type { AuditRepository, UserRepository } from "../../storage/repositories.js";
import { TOOL_ICONS } from "../../utils/constants.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("message-handler");

export interface MessageDeps {
  claude: ClaudeIntegration;
  memory: MemoryStore | null;
  users: UserRepository;
  audit: AuditRepository;
  approvedDirectory: string;
  systemPrompt: string;
}

// Track active requests for typing indicator
const activeRequests = new Set<number>();

export function createMessageHandler(deps: MessageDeps) {
  return async (ctx: Context): Promise<void> => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text;

    if (!userId || !chatId || !text) return;

    // Skip commands
    if (text.startsWith("/")) return;

    // Track user
    deps.users.upsert(userId, ctx.from?.username ?? null);
    deps.audit.log(userId, "message", text.slice(0, 200));

    // Prevent concurrent requests per user
    if (activeRequests.has(userId)) {
      await ctx.reply("Still working on your previous request...");
      return;
    }

    activeRequests.add(userId);

    // Send typing indicator (refreshes every 4s)
    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(chatId, "typing").catch(() => {});
    }, 4000);
    await ctx.api.sendChatAction(chatId, "typing").catch(() => {});

    try {
      // Build system prompt with memory context
      let prompt = deps.systemPrompt;
      if (deps.memory) {
        const memoryContent = deps.memory.loadMemoryFile();
        const dailyNote = deps.memory.getDailyNote();
        if (memoryContent) {
          prompt += `\n\n---\n\n# Memory\n${memoryContent}`;
        }
        if (dailyNote) {
          prompt += `\n\n---\n\n# Today's Notes\n${dailyNote}`;
        }
      }

      // Execute via Claude
      const toolUpdates: string[] = [];
      const response = await deps.claude.runCommand(text, userId, deps.approvedDirectory, {
        systemPrompt: prompt,
        onStream: (update) => {
          if (update.type === "tool_start" && update.toolName) {
            const icon = TOOL_ICONS[update.toolName] ?? "🔧";
            toolUpdates.push(`${icon} ${update.toolName}`);
          }
        },
      });

      // Format response
      let reply = response.content;

      // Add tool usage footer if verbose
      if (toolUpdates.length > 0) {
        reply += `\n\n_Tools: ${toolUpdates.join(", ")}_`;
      }

      // Add cost footer
      if (response.cost > 0) {
        reply += `\n_Cost: $${response.cost.toFixed(4)} | ${response.durationMs}ms_`;
      }

      // Send response (handle long messages)
      if (reply.length > 4096) {
        const chunks = splitMessage(reply);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() =>
            // Fallback to plain text if Markdown fails
            ctx.reply(chunk),
          );
        }
      } else {
        await ctx.reply(reply, { parse_mode: "Markdown" }).catch(() =>
          ctx.reply(reply),
        );
      }

      // Auto-extract memories from conversation
      if (deps.memory && !response.isError) {
        extractAndStoreMemory(deps.memory, userId, text, response.content);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error({ userId, error: message }, "Message handling failed");
      await ctx.reply(`Error: ${message}`);
    } finally {
      clearInterval(typingInterval);
      activeRequests.delete(userId);
    }
  };
}

function splitMessage(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= 4096) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n\n", 4096);
    if (splitAt === -1) splitAt = remaining.lastIndexOf("\n", 4096);
    if (splitAt === -1) splitAt = 4096;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Auto-extract important info from conversations into memory.
 * Looks for explicit "remember" patterns and key decisions.
 */
function extractAndStoreMemory(
  memory: MemoryStore,
  userId: number,
  userMessage: string,
  response: string,
): void {
  // Check if user explicitly asked to remember something
  const rememberPatterns = [
    /remember that (.+)/i,
    /note that (.+)/i,
    /keep in mind[: ]+(.+)/i,
    /don't forget[: ]+(.+)/i,
  ];

  for (const pattern of rememberPatterns) {
    const match = userMessage.match(pattern);
    if (match?.[1]) {
      memory.remember(userId, match[1].trim(), "fact", 0.9);
      return;
    }
  }
}
