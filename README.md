<p align="center">
  <h1 align="center">Maverick Agent</h1>
  <p align="center">Your personal 24x7 AI assistant on WhatsApp, Telegram, iMessage, and the terminal.</p>
</p>

<p align="center">
  <a href="https://github.com/Justmalhar/maverick-agent/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT">
  </a>
  <a href="https://platform.claude.com/docs/en/agent-sdk/overview">
    <img src="https://img.shields.io/badge/Claude-Agent%20SDK-blue?style=for-the-badge" alt="Claude Agent SDK">
  </a>
  <a href="https://opencode.ai">
    <img src="https://img.shields.io/badge/Opencode-Supported-orange?style=for-the-badge" alt="Opencode">
  </a>
  <a href="https://github.com/Justmalhar/maverick-agent">
    <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge" alt="PRs Welcome">
  </a>
</p>

---

Maverick Agent is a Node.js AI assistant that lives on your messaging platforms. Send a message on WhatsApp, Telegram, or iMessage and get intelligent responses with full tool access, persistent memory, scheduled reminders, and integrations with GitHub, Vercel, Supabase, Google Tasks/Calendar, and more.

**Use any model you want.** Claude Agent SDK or Opencode — switch with one config change, no lock-in.

**Lives where you do.** WhatsApp, Telegram, iMessage, and the terminal — all from a single gateway process.

**Persistent memory.** Remembers your preferences, people, and decisions across sessions.

**Scheduled automations.** Natural language cron jobs — daily standups, weekly reports, one-time reminders.

**Deep integrations.** GitHub repos/PRs/issues, Google Tasks & Calendar, Vercel deploys, Supabase queries, Brave Search, Docker management.

**15+ built-in tools.** File operations, web search, code execution, voice (TTS/STT), system monitoring, and more.

---

## Table of Contents

- [Quick Install](#quick-install)
- [Getting Started](#getting-started)
- [Providers](#providers)
- [CLI vs Messaging](#cli-vs-messaging)
- [Configuration](#configuration)
- [Messaging Platforms](#messaging-platforms)
- [Memory System](#memory-system)
- [Scheduling and Reminders](#scheduling-and-reminders)
- [Integrations](#integrations)
- [Commands](#commands)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)
- [Directory Structure](#directory-structure)
- [Contributing](#contributing)
- [Community](#community)
- [License](#license)

---

## Quick Install

Get Maverick Agent running in under two minutes.

**Linux / macOS / WSL2:**

```bash
curl -fsSL https://raw.githubusercontent.com/Justmalhar/maverick-agent/main/install.sh | bash
```

**Windows (native):** Use WSL2, then run the command above inside WSL.

The installer handles everything — Git, Node.js, Claude Code, dependencies, the `maverick` command, and interactive API key setup.

**Options:**

```bash
curl -fsSL ... | bash -s -- --skip-setup    # skip interactive config
curl -fsSL ... | bash -s -- --dir /opt/mav   # custom install directory
curl -fsSL ... | bash -s -- --branch dev     # install a specific branch
```

After installation:

```bash
source ~/.zshrc   # or: source ~/.bashrc
maverick          # Open interactive menu
```

---

## Getting Started

```bash
maverick              # Interactive menu
maverick chat         # Terminal chat — talk directly
maverick start        # Start the messaging gateway
maverick setup        # Re-run the setup wizard
maverick config       # Show current config
```

---

## Providers

Maverick Agent supports two AI providers — use whichever fits your workflow.

**Claude Agent SDK** — Anthropic's SDK. Models: Opus 4.6, Sonnet 4.5, Haiku 4.5. Requires `ANTHROPIC_API_KEY` and Claude Code CLI.

**Opencode** — Open-source alternative. Models: GPT-5 Nano, Big Pickle, GLM-4.7, Grok Code, MiniMax M2.1. Requires Opencode CLI.

Switch providers from the CLI menu or in `config.js`:

```javascript
agent: {
  provider: 'claude',    // or 'opencode'
}
```

No code changes needed — the provider interface is abstracted.

---

## CLI vs Messaging

Maverick has two entry points: the terminal CLI (`maverick chat`) or the messaging gateway (WhatsApp, Telegram, iMessage). Many slash commands work in both.

| Action | CLI | Messaging Platforms |
|--------|-----|---------------------|
| Start chatting | `maverick chat` | Send a message to your bot |
| Start fresh | `/new` or `/reset` | `/new` or `/reset` |
| Switch model | `/model` | `/model` |
| View memory | `/memory` | `/memory` |
| Search memory | `/memory search <q>` | `/memory search <q>` |
| Stop current work | `Ctrl+C` | `/stop` |
| Queue status | `/queue` | `/queue` |
| Show help | `/help` | `/help` |

---

## Configuration

All settings live in `config.js`. Edit directly or use the setup wizard.

```javascript
{
  agentId: 'maverick-agent',

  whatsapp: { enabled: true, allowedDMs: [...], allowedGroups: [...] },
  telegram: { enabled: false, token: '', ... },
  imessage: { enabled: false, ... },

  agent: {
    workspace: '~/maverick-agent',
    maxTurns: 100,
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    provider: 'claude',          // or 'opencode'
  },

  providers: {
    todo: 'google',        // 'google' or 'microsoft'
    calendar: 'google',    // 'google' or 'microsoft'
    tts: 'elevenlabs',     // 'elevenlabs', 'fal', or 'replicate'
    stt: 'groq'            // 'groq', 'fal', or 'replicate'
  }
}
```

API keys are stored in `.env` (never committed to git).

---

## Messaging Platforms

### WhatsApp

Uses QR code authentication — no bot token needed.

1. Start the gateway: `maverick start`
2. Scan the QR code (WhatsApp > Settings > Linked Devices)
3. Session saves to `auth_whatsapp/` — you only scan once

### Telegram

1. Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, copy the token
2. Add the token to `.env`: `TELEGRAM_BOT_TOKEN=your-token`
3. Start the gateway, then message your bot

### iMessage

macOS only. Requires the `imsg` CLI tool.

```bash
brew install steipete/formulae/imsg
```

Enable in config. Make sure Messages.app is open and signed in.

---

## Memory System

Persistent memory stored at `~/.maverick/Memory/`.

| File | Purpose |
|------|---------|
| `MEMORY.md` | Long-term: preferences, people, decisions |
| `YYYY-MM-DD.md` | Daily conversation logs |
| `[topic].md` | Topic-specific notes |

Memory is loaded at the start of each conversation. The assistant writes to memory when you ask it to remember something.

**Commands:** `/memory`, `/memory list`, `/memory search <query>`

---

## Scheduling and Reminders

Natural language scheduling — no cron syntax required.

- "Remind me in 30 minutes to check the oven" — one-time delay
- "Every day at 9am, send me a standup reminder" — recurring cron
- "Every weekday at 8am" — weekday-only schedule

Jobs persist in `~/maverick-agent/Automations/Jobs/cron-jobs.json` and execute while the gateway is running.

---

## Integrations

| Integration | What it does | Setup |
|-------------|-------------|-------|
| **GitHub** | Repos, issues, PRs, commits, workflows, code search | `GITHUB_PAT=ghp_...` in `.env` |
| **Google Tasks** | Todo management | OAuth2 credentials in `.env` |
| **Google Calendar** | Event management | OAuth2 credentials in `.env` |
| **Microsoft To Do** | Alternative to Google Tasks | `TODO_PROVIDER=microsoft` in `.env` |
| **Microsoft Outlook** | Alternative to Google Calendar | `CALENDAR_PROVIDER=microsoft` in `.env` |
| **Vercel** | Deploy and manage projects | `VERCEL_TOKEN=...` in `.env` |
| **Supabase** | Query databases | `SUPABASE_URL`, `SUPABASE_ANON_KEY` in `.env` |
| **Brave Search** | Web, news, image, video search | `BRAVE_API_KEY=...` in `.env` |
| **Docker** | Manage containers, images, compose stacks | Requires Docker installed |
| **System Monitor** | CPU, memory, disk, network, processes | Built-in |
| **Voice (TTS/STT)** | Text-to-speech and speech-to-text | Provider API keys in `.env` |

---

## Commands

### CLI

```bash
maverick              # interactive menu
maverick chat         # terminal chat
maverick start        # start gateway
maverick setup        # setup wizard
maverick config       # show config
maverick help         # help
```

### In Chat

| Command | Description |
|---------|-------------|
| `/new`, `/reset` | Start a fresh conversation |
| `/status` | Show session info |
| `/memory` | Show memory summary |
| `/memory list` | List all memory files |
| `/memory search <query>` | Search memories |
| `/model` | Switch model (terminal only) |
| `/queue` | Message queue status |
| `/stop` | Stop current operation |
| `/help` | Show commands |

---

## Documentation

| Section | What's Covered |
|---------|----------------|
| [Quick Install](#quick-install) | One-liner install, options, install layout |
| [Getting Started](#getting-started) | First conversation in 2 minutes |
| [Providers](#providers) | Claude SDK, Opencode, switching |
| [CLI vs Messaging](#cli-vs-messaging) | Commands across interfaces |
| [Configuration](#configuration) | config.js, .env, all options |
| [Messaging Platforms](#messaging-platforms) | WhatsApp, Telegram, iMessage setup |
| [Memory System](#memory-system) | Persistent memory, search |
| [Scheduling](#scheduling-and-reminders) | Cron jobs, natural language |
| [Integrations](#integrations) | GitHub, Google, Vercel, Supabase, etc. |
| [Commands](#commands) | CLI and chat commands |
| [Troubleshooting](#troubleshooting) | Common issues and fixes |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ANTHROPIC_API_KEY not set` | Export in shell or set in `.env` |
| `claude: command not found` | `npm install -g @anthropic-ai/claude-code` |
| `opencode: command not found` | `curl -fsSL https://opencode.ai/install \| bash` |
| WhatsApp QR not appearing | Delete `auth_whatsapp/` and restart |
| Telegram bot not responding | Verify token, send `/start` to bot, check `enabled: true` |
| iMessage not working | macOS only — check Messages.app is open, `which imsg`, accessibility permissions |
| Opencode server failing | Kill old process: `kill $(lsof -ti :4096)` |

---

## Directory Structure

```
maverick-agent/
  install.sh             one-line installer (curl | bash)
  setup.sh               Docker-based setup script
  config.js              configuration
  cli.js                 CLI entry point (menu, terminal chat)
  gateway.js             gateway process (messaging platforms)
  Dockerfile             container build for remote deployment
  docker-compose.yml     Docker Compose config
  adapters/
    base.js              base adapter class
    whatsapp.js          WhatsApp via Baileys
    telegram.js          Telegram via node-telegram-bot-api
    imessage.js          iMessage via imsg (macOS)
  agent/
    claude-agent.js      agent with memory, cron, system prompt
    runner.js            queue + run coordinator
  providers/
    base-provider.js     provider interface
    claude-provider.js   Claude Agent SDK provider
    opencode-provider.js Opencode provider
    index.js             provider registry
  tools/
    base/                core tools (cron, voice, system, etc.)
    services/            integration tools (github, vercel, supabase, etc.)
    tool-registry.js     tool registration
  commands/
    handler.js           slash command handlers
  sessions/
    manager.js           session tracking
  memory/
    manager.js           memory file management
  clients/
    web/                 Next.js web client
  file-system/
    Agents/              sub-agent definitions (architect, dev, reviewer, etc.)
    Skills/              agent skills (brainstorming, design, debugging, etc.)
    Memory/              persistent memory files
    Automations/         scheduled tasks and logs
    Projects/            active projects
    Documents/           general documents
```

---

## Contributing

We welcome contributions!

```bash
git clone https://github.com/Justmalhar/maverick-agent.git
cd maverick-agent
npm install
node cli.js            # start developing
```

1. Fork the repo
2. Create a branch (`git checkout -b feat/my-feature`)
3. Make your changes and commit (`git commit -m 'Add my feature'`)
4. Push to your branch (`git push origin feat/my-feature`)
5. Open a Pull Request

---

## Community

- [GitHub Issues](https://github.com/Justmalhar/maverick-agent/issues) — bug reports and feature requests
- [Pull Requests](https://github.com/Justmalhar/maverick-agent/pulls) — contributions welcome

---

## License

MIT — see [LICENSE](https://github.com/Justmalhar/maverick-agent/blob/main/LICENSE).

Built by [Malhar Ujawane](https://github.com/justmalhar).
