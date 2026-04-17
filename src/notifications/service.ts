import type { Bot } from "grammy";
import { TELEGRAM_MAX_MESSAGE_LENGTH, TELEGRAM_RATE_LIMIT_PER_CHAT_MS } from "../utils/constants.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("notifications");

export class NotificationService {
  private lastSendPerChat = new Map<number, number>();

  constructor(private bot: Bot) {}

  async send(chatId: number, text: string, parseMode?: "HTML"): Promise<void> {
    const chunks = this.splitMessage(text);

    for (const chunk of chunks) {
      await this.rateLimitedSend(chatId, chunk, parseMode);
    }
  }

  private async rateLimitedSend(
    chatId: number,
    text: string,
    parseMode?: "HTML",
  ): Promise<void> {
    const lastSend = this.lastSendPerChat.get(chatId) ?? 0;
    const elapsed = Date.now() - lastSend;

    if (elapsed < TELEGRAM_RATE_LIMIT_PER_CHAT_MS) {
      await Bun.sleep(TELEGRAM_RATE_LIMIT_PER_CHAT_MS - elapsed);
    }

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: parseMode,
      });
      this.lastSendPerChat.set(chatId, Date.now());
    } catch (error) {
      log.error({ chatId, error }, "Failed to send notification");
    }
  }

  private splitMessage(text: string): string[] {
    if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Split at paragraph boundary
      let splitIndex = remaining.lastIndexOf(
        "\n\n",
        TELEGRAM_MAX_MESSAGE_LENGTH,
      );
      if (splitIndex === -1) {
        splitIndex = remaining.lastIndexOf("\n", TELEGRAM_MAX_MESSAGE_LENGTH);
      }
      if (splitIndex === -1) {
        splitIndex = TELEGRAM_MAX_MESSAGE_LENGTH;
      }

      chunks.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
  }
}
