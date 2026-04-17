import type { Context, NextFunction } from "grammy";
import type { AuthManager } from "../../security/auth.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("auth-middleware");

export function createAuthMiddleware(authManager: AuthManager) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (authManager.isAuthenticated(userId)) {
      authManager.refreshSession(userId);
      return next();
    }

    if (authManager.authenticate(userId)) {
      log.info({ userId, username: ctx.from?.username }, "User authenticated");
      return next();
    }

    log.warn({ userId, username: ctx.from?.username }, "Access denied");
    await ctx.reply("Access denied. You are not authorized to use this bot.");
  };
}
