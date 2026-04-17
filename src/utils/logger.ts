import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level,
  transport: isDev
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

export function createChildLogger(name: string) {
  return logger.child({ module: name });
}
