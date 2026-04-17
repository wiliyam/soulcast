import { z } from "zod";

export const settingsSchema = z.object({
  // Telegram
  telegramBotToken: z.string().min(1),
  telegramBotUsername: z.string().min(1),

  // Directory
  approvedDirectory: z.string().min(1).default("/"),

  // Auth
  allowedUsers: z
    .string()
    .default("")
    .transform((v) => (v ? v.split(",").map((id) => Number(id.trim())) : [])),

  // Claude
  claudeModel: z.string().default("claude-sonnet-4-6"),
  claudeMaxTurns: z.coerce.number().default(10),
  claudeTimeoutSeconds: z.coerce.number().default(300),

  // Features
  agenticMode: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Rate limiting
  rateLimitRequests: z.coerce.number().default(100),
  rateLimitWindowMs: z.coerce.number().default(60_000),

  // Scheduler
  enableScheduler: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // Memory
  enableMemory: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  memoryDir: z.string().default("./memory"),

  // Identity
  soulPath: z.string().optional(),
  identityPath: z.string().optional(),
});

export type Settings = z.infer<typeof settingsSchema>;
