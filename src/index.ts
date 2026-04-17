import { resolve } from "node:path";
import { loadSettings } from "./config/loader.js";
import { createChildLogger } from "./utils/logger.js";
import { APP_NAME, VERSION } from "./utils/constants.js";
import { DatabaseManager } from "./storage/database.js";
import {
  AuditRepository,
  JobRepository,
  MemoryRepository,
  MessageRepository,
  SessionRepository,
  UserRepository,
} from "./storage/repositories.js";
import { AuthManager } from "./security/auth.js";
import { ClaudeSDK } from "./claude/sdk.js";
import { SessionManager } from "./claude/session.js";
import { ClaudeIntegration } from "./claude/facade.js";
import { IdentityLoader } from "./identity/loader.js";
import { MemoryStore } from "./memory/store.js";
import { EventBus } from "./events/bus.js";
import { createBot } from "./bot/core.js";

const log = createChildLogger("main");

async function main() {
  log.info({ name: APP_NAME, version: VERSION }, "Starting...");

  // 1. Load config
  const settings = loadSettings();
  log.info(
    {
      agenticMode: settings.agenticMode,
      approvedDir: settings.approvedDirectory,
      model: settings.claudeModel,
      memory: settings.enableMemory,
    },
    "Configuration loaded",
  );

  // 2. Initialize database
  const dbPath = resolve(settings.approvedDirectory, ".babu-bhai", "data.db");
  const db = new DatabaseManager(dbPath);
  db.initialize();

  // Repositories
  const users = new UserRepository(db.raw);
  const sessions = new SessionRepository(db.raw);
  const messages = new MessageRepository(db.raw);
  const memoryRepo = new MemoryRepository(db.raw);
  const audit = new AuditRepository(db.raw);

  // 3. Auth
  const auth = new AuthManager(settings.allowedUsers);

  // 4. Claude integration
  const claudeSdk = new ClaudeSDK(
    settings.claudeModel,
    settings.claudeMaxTurns,
    settings.claudeTimeoutSeconds,
  );
  const sessionManager = new SessionManager(sessions);
  const claude = new ClaudeIntegration(claudeSdk, sessionManager, messages);

  // 5. Identity
  const configDir = resolve(settings.approvedDirectory, ".babu-bhai");
  const identity = new IdentityLoader(configDir, settings.approvedDirectory);
  const systemPrompt = identity.load();

  // 6. Memory (optional)
  let memory: MemoryStore | null = null;
  if (settings.enableMemory) {
    const memoryDir = resolve(settings.approvedDirectory, ".babu-bhai", "memory");
    memory = new MemoryStore(memoryDir, memoryRepo);
    log.info({ memoryDir }, "Memory system enabled");
  }

  // 7. Event bus
  const eventBus = new EventBus();
  eventBus.start();

  // 8. Create bot
  const bot = createBot({
    settings,
    auth,
    claude,
    memory,
    users,
    audit,
    systemPrompt,
  });

  // 9. Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");
    eventBus.stop();
    await bot.stop();
    db.close();
    log.info("Goodbye.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 10. Start bot
  log.info("Bot starting in polling mode...");
  await bot.start({
    onStart: () => {
      log.info(
        { username: settings.telegramBotUsername },
        `${APP_NAME} is running!`,
      );
    },
  });
}

main().catch((error) => {
  log.fatal({ error }, "Fatal error");
  process.exit(1);
});
