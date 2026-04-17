# Babu Bhai

Open-source AI agent gateway for Telegram. Control Claude Code from your phone with persistent memory, bot identity, and scheduled tasks.

Built with **Bun + TypeScript** for maximum performance. Zero Python. Zero bloat.

---

## Features

| Feature | Description |
|---|---|
| **Full Claude Code Access** | Read, write, edit files, run bash, git — all from Telegram |
| **Session Persistence** | Auto-resumes conversations across restarts (SQLite-backed) |
| **Bot Identity** | SOUL.md + IDENTITY.md personality system (like OpenClaw) |
| **Persistent Memory** | Remembers facts, preferences, decisions across sessions |
| **Memory Search** | Keyword search across all stored memories |
| **Daily Notes** | Auto-summarizes conversations by day |
| **Scheduled Tasks** | Cron jobs with timezone support and session isolation |
| **Rate Limiting** | Token bucket per user to prevent abuse |
| **Security** | User whitelist, path isolation, input validation, audit logging |
| **Typing Indicator** | Shows "typing..." while Claude works |
| **Auto-Memory** | Extracts "remember that..." patterns from conversations |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1+
- [Claude Code CLI](https://claude.ai/code) installed and authenticated (`claude login`)
- Telegram bot token (from [@BotFather](https://t.me/BotFather))

### 1. Create a Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token

### 2. Install

```bash
git clone https://github.com/wiliyam/babu-bhai.git
cd babu-bhai
bun install
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_BOT_USERNAME=your_bot_username
APPROVED_DIRECTORY=/path/to/your/projects
ALLOWED_USERS=your_telegram_user_id
```

> **How to find your Telegram user ID:** Message [@userinfobot](https://t.me/userinfobot) on Telegram.

### 4. Run

```bash
bun start
```

Or in development mode (auto-reload):

```bash
bun dev
```

### 5. Talk to your bot

Open your bot in Telegram and send any message. Babu Bhai will use Claude Code to help you.

---

## Commands

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/new` | Reset session (fresh context) |
| `/status` | Session info, cost, project path |
| `/memory [query]` | Search or list stored memories |
| `/remember <text>` | Manually save something to memory |
| `/help` | All commands |

**Any other text message** is sent to Claude Code as a prompt.

---

## Bot Identity (SOUL.md)

Give your bot a personality by creating identity files in your project's `.babu-bhai/` directory:

```
.babu-bhai/
  SOUL.md        # Core personality, thinking style, behavioral rules
  IDENTITY.md    # Name, metadata, avatar description
  memory/
    MEMORY.md    # Persistent facts (auto-managed)
    2026-04-17.md  # Daily conversation notes (auto-managed)
```

**Example SOUL.md:**

```markdown
# Babu Bhai

You are Babu Bhai, a senior full-stack developer and DevOps engineer.
You speak concisely and prefer action over discussion.
You always explain your reasoning before making changes.
You never commit without asking first.

## Rules
- Always read the file before editing
- Use conventional commits
- Prefer small, focused changes
- Run tests after code changes
```

The bot loads these files at session start, giving it consistent personality across all conversations.

---

## Memory System

Babu Bhai remembers things across sessions:

**Automatic:** Say "remember that the deploy key is in vault" and it's saved.

**Manual:** Use `/remember API rate limit is 100 req/min`

**Search:** Use `/memory deploy key` to find related memories.

**How it works:**
- Memories stored in SQLite (searchable) + `MEMORY.md` (human-readable)
- Daily notes auto-created in `memory/YYYY-MM-DD.md`
- Memory content injected into system prompt at session start
- Importance scoring for relevance ranking

---

## Configuration

All settings via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from BotFather |
| `TELEGRAM_BOT_USERNAME` | Yes | — | Bot username (without @) |
| `APPROVED_DIRECTORY` | Yes | `/` | Base directory for file access |
| `ALLOWED_USERS` | No | — | Comma-separated Telegram user IDs (empty = allow all) |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-6` | Claude model to use |
| `CLAUDE_MAX_TURNS` | No | `10` | Max tool-use turns per message |
| `CLAUDE_TIMEOUT_SECONDS` | No | `300` | Timeout per message |
| `AGENTIC_MODE` | No | `true` | Enable agentic mode |
| `LOG_LEVEL` | No | `info` | Log level (debug/info/warn/error) |
| `RATE_LIMIT_REQUESTS` | No | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window (ms) |
| `ENABLE_MEMORY` | No | `true` | Enable memory system |

---

## Deploy on EC2 (systemd)

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone and install
git clone https://github.com/wiliyam/babu-bhai.git
cd babu-bhai
bun install

# Create .env
cp .env.example .env
# Edit .env with your values

# Create systemd service
sudo tee /etc/systemd/system/babu-bhai.service << 'EOF'
[Unit]
Description=Babu Bhai AI Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/babu-bhai
ExecStart=/home/ec2-user/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/ec2-user/babu-bhai/.env

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable babu-bhai
sudo systemctl start babu-bhai

# Check logs
sudo journalctl -u babu-bhai -f
```

---

## Architecture

```
src/
  index.ts              # Entry point — wires everything together
  config/               # Zod-validated settings from env
  bot/
    core.ts             # grammY bot + middleware chain
    handlers/           # /start, /new, /status, /memory + message handler
    middleware/          # Auth, rate limiting
  claude/
    sdk.ts              # Claude Agent SDK wrapper
    session.ts          # Session persistence + auto-resume
    facade.ts           # High-level integration
  identity/
    loader.ts           # SOUL.md personality bootstrap
  memory/
    store.ts            # MEMORY.md + daily notes + SQLite
  storage/
    database.ts         # Bun SQLite + migrations
    models.ts           # TypeScript interfaces
    repositories.ts     # Data access layer
  events/
    bus.ts              # Async pub/sub event bus
  notifications/
    service.ts          # Rate-limited Telegram delivery
  security/
    auth.ts             # User whitelist + session management
    validator.ts        # Path traversal + injection prevention
```

**Tech stack:** Bun, TypeScript, grammY, claude-agent-sdk, Zod, Bun SQLite, pino, croner

---

## Roadmap

- [x] Core bot with Claude Code integration
- [x] Session persistence and auto-resume
- [x] Bot identity (SOUL.md)
- [x] Persistent memory system
- [ ] Scheduled tasks (cron) with session isolation
- [ ] Webhook support (GitHub, generic)
- [ ] Voice message transcription
- [ ] Image/file upload handling
- [ ] Multi-project support (switch between projects)
- [ ] Web dashboard
- [ ] Multi-channel (Slack, Discord)

---

## Contributing

Contributions welcome! This is an open-source project built for the community.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run `bun lint` and `bun typecheck`
5. Commit with conventional commits (`feat:`, `fix:`, `refactor:`)
6. Open a PR

### Development

```bash
# Install deps
bun install

# Run in dev mode (auto-reload)
bun dev

# Type check
bun typecheck

# Lint
bun lint

# Format
bun format

# Run tests
bun test
```

---

## License

[MIT](LICENSE)

---

Built with Bun, TypeScript, and Claude. Open source forever.
