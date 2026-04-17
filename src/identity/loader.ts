import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("identity");

/**
 * Identity loader — OpenClaw-style SOUL.md + IDENTITY.md personality bootstrap.
 *
 * Loads Markdown files in priority order and merges them into a system prompt
 * that gives the bot its personality, knowledge, and behavioral rules.
 *
 * File loading order (all optional):
 *   1. SOUL.md      — Core personality, thinking style, behavioral rules
 *   2. IDENTITY.md  — Name, avatar description, metadata
 *   3. CLAUDE.md    — Project-specific context (from working directory)
 *   4. MEMORY.md    — Persistent facts and preferences
 */

const IDENTITY_FILES = ["SOUL.md", "IDENTITY.md"];

export class IdentityLoader {
  private systemPrompt: string = "";

  constructor(
    private configDir: string,
    private projectDir: string,
  ) {}

  load(): string {
    const parts: string[] = [];

    // Load identity files from config directory
    for (const filename of IDENTITY_FILES) {
      const filePath = resolve(this.configDir, filename);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8").trim();
        if (content) {
          parts.push(content);
          log.info({ file: filename }, "Loaded identity file");
        }
      }
    }

    // Load CLAUDE.md from project directory
    const claudeMdPath = resolve(this.projectDir, "CLAUDE.md");
    if (existsSync(claudeMdPath)) {
      const content = readFileSync(claudeMdPath, "utf-8").trim();
      if (content) {
        parts.push(content);
        log.info("Loaded project CLAUDE.md");
      }
    }

    this.systemPrompt = parts.join("\n\n---\n\n");

    if (parts.length === 0) {
      log.warn("No identity files found, using default prompt");
      this.systemPrompt =
        "You are Babu Bhai, an AI assistant accessible via Telegram. " +
        "You help developers with coding tasks, project management, and DevOps. " +
        "You have access to the filesystem and can read, write, and execute code.";
    }

    return this.systemPrompt;
  }

  getPrompt(): string {
    return this.systemPrompt;
  }
}
