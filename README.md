<p align="center">
  <h1 align="center">Maverick Agent</h1>
</p>

<p align="center">
  <a href="https://platform.claude.com/docs/en/agent-sdk/overview">
    <img src="https://img.shields.io/badge/Claude-Agent%20SDK-blue" alt="Claude Agent SDK">
  </a>
  <a href="https://github.com/anthropics/claude-code">
    <img src="https://img.shields.io/badge/Powered%20by-Claude%20Code-purple" alt="Claude Code">
  </a>
</p>

<p align="center">
  A personal 24x7 AI assistant that runs on your messaging platforms. Send a message on WhatsApp, Telegram, or iMessage and get responses from Claude with full tool access, persistent memory, scheduled reminders, and integrations with GitHub, Vercel, Supabase, Google Tasks/Calendar, and more.
</p>

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Deploying Remotely](#deploying-remotely)
- [Providers](#providers)
- [Configuration](#configuration)
- [Messaging Platforms](#messaging-platforms)
- [Tool Approvals](#tool-approvals)
- [Memory System](#memory-system)
- [Scheduling and Reminders](#scheduling-and-reminders)
- [Integrations](#integrations)
- [Commands](#commands)
- [Troubleshooting](#troubleshooting)
- [Directory Structure](#directory-structure)
- [Contributing](#contributing)

---

## Requirements

- Node.js 18+
- macOS, Linux, or Windows
- Anthropic API key (`ANTHROPIC_API_KEY`)
- **Claude Code** — required if using the Claude provider
- **Opencode** — required if using the Opencode provider

Platform-specific:
- WhatsApp: a phone with WhatsApp installed
- Telegram: a bot token from @BotFather
- iMessage: macOS only, requires the `imsg` CLI tool

---

## Installation

### Quick Install (recommended)

Get Maverick Agent running in under two minutes:

**Linux / macOS / WSL2:**

```bash
curl -fsSL https://raw.githubusercontent.com/justmalhar/maverick-agent/main/install.sh | bash
```

The installer handles everything — Git, Node.js, Claude Code, dependencies, the `maverick` command, and interactive API key setup.

**Windows (native):** Use WSL2, then run the command above inside WSL.

**Options:**

```bash
curl -fsSL ... | bash -s -- --skip-setup    # skip interactive config
curl -fsSL ... | bash -s -- --dir /opt/mav   # custom install directory
curl -fsSL ... | bash -s -- --branch dev     # install a specific branch
```

**After installation:**

```bash
source ~/.zshrc   # or: source ~/.bashrc
maverick          # Open interactive menu
```

To reconfigure later:

```bash
maverick setup    # Re-run setup wizard
maverick config   # Show current config
maverick start    # Start messaging gateway
```

---

### Manual Installation

#### 1. Clone and install dependencies

```bash
git clone <repo-url> maverick-agent
cd maverick-agent
npm install
```

#### 2. Install a provider

You need at least one AI provider installed on the machine.

**Claude Code** (for the Claude provider):

```bash
npm install -g @anthropic-ai/claude-code
```

**Opencode** (for the Opencode provider):

```bash
curl -fsSL https://opencode.ai/install | bash
```

You can install both. The CLI lets you switch between them.

After installing Claude Code, authenticate it locally:

```bash
claude
# Follow the OAuth prompts to log in with your Anthropic account
```

On remote/Docker deployments, authentication is handled by the `ANTHROPIC_API_KEY` environment variable instead — no interactive login needed.

#### 3. API keys

**Anthropic** — get your key from https://console.anthropic.com/

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Add all exports to your shell profile (`~/.zshrc` or `~/.bashrc`) to make them permanent.

### Install Layout

The installer puts files in these locations:

| What | Where |
|------|-------|
| Code | `~/.maverick/maverick-agent/` |
| Config & API keys | `~/.maverick/.env` |
| Memory files | `~/.maverick/Memory/` |
| CLI command | `~/.local/bin/maverick` (symlink) |

Set `MAVERICK_HOME` to change the data directory:

```bash
MAVERICK_HOME=/opt/maverick curl -fsSL ... | bash
```

### Docker Installation

For remote/server deployment:

```bash
cp .env.example .env
# Edit .env with your API keys
docker compose up -d --build
```

---

## Quick Start

```bash
node cli.js
```

This opens the interactive menu:

```
1) Terminal chat      — talk to the assistant in your terminal
2) Start gateway      — run the messaging gateway
3) Setup adapters     — configure WhatsApp, Telegram, etc.
4) Show current config
5) Test connection
6) Change provider
7) Exit
```

Or run directly:

```bash
node cli.js chat     # terminal chat
node cli.js start    # start the gateway
```

---

## Providers

Maverick Agent supports two AI providers:

**Claude Agent SDK** — Anthropic's SDK. Uses your `ANTHROPIC_API_KEY`. Requires Claude Code installed. Models: Opus 4.6, Sonnet 4.5, Haiku 4.5.

**Opencode** — open-source alternative. Requires Opencode installed. Runs a local server or connects to an existing one. Models: GPT-5 Nano, Big Pickle, GLM-4.7, Grok Code, MiniMax M2.1.

Switch providers from the CLI menu (option 7) or in `config.js`:

```javascript
agent: {
  provider: 'claude',    // or 'opencode'
}
```

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
    provider: 'claude',
    opencode: {
      model: 'opencode/gpt-5-nano',
      hostname: '127.0.0.1',
      port: 4096
    }
  },

  providers: {
    todo: 'google',        // 'google' or 'microsoft'
    calendar: 'google',    // 'google' or 'microsoft'
    tts: 'elevenlabs',     // 'elevenlabs', 'fal', or 'replicate'
    stt: 'groq'            // 'groq', 'fal', or 'replicate'
  }
}
```

---

## Messaging Platforms

### WhatsApp

Uses QR code authentication. No bot token needed.

1. Enable in config or run the setup wizard
2. Start the gateway
3. Scan the QR code that appears in your terminal (WhatsApp > Settings > Linked Devices)
4. Session saves to `auth_whatsapp/` — you only scan once

### Telegram

1. Message @BotFather on Telegram, send `/newbot`, copy the token
2. Add the token to config:

```javascript
telegram: {
  enabled: true,
  token: 'YOUR_BOT_TOKEN',
  allowedDMs: ['*'],
}
```

3. Start the gateway, then message your bot

### iMessage

macOS only. Requires the `imsg` CLI tool.

```bash
brew install steipete/formulae/imsg
```

Enable in config. Make sure Messages.app is open and signed in.

---

## Memory System

Persistent memory stored at `~/maverick-agent/Memory/`.

```
~/maverick-agent/Memory/
  MEMORY.md              — long-term: preferences, people, decisions
  YYYY-MM-DD.md          — daily logs
  [topic].md             — topic-specific notes
```

Memory is loaded at the start of each conversation. The assistant writes to memory when you ask it to remember something.

Use the `/memory` command in chat to view or search memories.

---

## Scheduling and Reminders

The assistant can schedule messages using cron tools.

- "Remind me in 30 minutes to check the oven" — one-time delay
- "Every day at 9am, send me a standup reminder" — cron expression `0 9 * * *`
- "Every weekday at 8am" — cron expression `0 8 * * 1-5`

Jobs persist in `~/maverick-agent/Automations/Jobs/cron-jobs.json` and execute while the gateway is running.

---

## Integrations

### GitHub

Native GitHub integration using Personal Access Token.

**Setup:**
1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Create a token with permissions: `repo`, `workflow`, `read:org`
3. Add to `.env`: `GITHUB_PAT=ghp_...`

**Capabilities:** Repos, issues, PRs, commits, workflows, code search

### Google Tasks

Native Google Tasks for todo management.

**Setup:**
1. Create Google Cloud project, enable Tasks API
2. Create OAuth2 credentials
3. Add to `.env`:
```
GOOGLE_TASKS_CLIENT_ID=...
GOOGLE_TASKS_CLIENT_SECRET=...
GOOGLE_TASKS_REFRESH_TOKEN=...
```

### Google Calendar

Native Google Calendar for event management.

**Setup:** Same as Google Tasks but with Calendar API scope

### Microsoft To Do

Alternative to Google Tasks. Set `TODO_PROVIDER=microsoft` in `.env`.

### Microsoft Outlook Calendar

Alternative to Google Calendar. Set `CALENDAR_PROVIDER=microsoft` in `.env`.

### Vercel

Deploy and manage Vercel projects. Add `VERCEL_TOKEN=...` to `.env`.

### Supabase

Query Supabase databases. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` to `.env`.

### Brave Search

Web, news, image, video search. Add `BRAVE_API_KEY=...` to `.env`.

### Docker

Manage containers, images, compose stacks. Requires Docker installed.

### System Monitor

CPU, memory, disk, network, processes. Built-in.

### Voice (TTS/STT)

Text-to-speech and speech-to-text with multiple providers:

```bash
TTS_PROVIDER=elevenlabs    # elevenlabs, fal, or replicate
STT_PROVIDER=groq          # groq, fal, or replicate
```

Requires provider API keys in `.env`.

---

## Commands

### CLI

```bash
node cli.js              # interactive menu
node cli.js chat         # terminal chat
node cli.js start        # start gateway
node cli.js setup        # setup wizard
node cli.js config       # show config
node cli.js help         # help
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

## Troubleshooting

**"ANTHROPIC_API_KEY not set"** — export the key in your shell or `.env` file.

**"claude: command not found"** — Claude Code is not installed. Run `curl -fsSL https://claude.ai/install.sh | bash`.

**"opencode: command not found"** — Opencode is not installed. Run `curl -fsSL https://opencode.ai/install | bash`.

**WhatsApp QR not appearing** — delete `auth_whatsapp/` and restart.

**Telegram bot not responding** — verify the token, make sure you sent `/start` to your bot, check `enabled: true`.

**iMessage not working** — macOS only. Check that Messages.app is open, imsg is installed (`which imsg`), and accessibility permissions are granted.

**Opencode server failing** — if port 4096 is already in use from a previous run, kill the old process: `kill $(lsof -ti :4096)`.

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
    cron.js              scheduling tools
    gateway.js           gateway MCP tools
    github.js            GitHub integration
    google-tasks.js      Google Tasks
    google-calendar.js   Google Calendar
    microsoft-todo.js    Microsoft To Do
    microsoft-calendar.js Microsoft Outlook Calendar
    vercel.js            Vercel integration
    supabase.js          Supabase integration
    search.js            Brave Search
    docker.js            Docker management
    system.js            System monitoring
    voice.js             TTS/STT
    applescript.js       macOS automation
  commands/
    handler.js           slash command handlers
  sessions/
    manager.js           session tracking
  memory/
    manager.js           memory file management
  Skills/                agent skills
  Agents/                sub-agent definitions
    architect-agent.md   system design
    backend-dev.md       backend development
    code-reviewer.md     code review
    data-agent.md        data analysis
    debug-agent.md       debugging
    docs-writer.md       documentation
    frontend-dev.md      frontend development
    orchestrator-agent.md workflow coordination
    planning-agent.md    planning
    research-agent.md    research
    security-auditor.md  security auditing
    test-writer.md       test generation
  Documents/             general documents
  Development/           code projects
  Downloads/             downloaded files
  Media/                 images, audio, video
  Projects/              active projects
  Archive/               completed work
  Temp/                  temporary files
  Automations/           scheduled tasks
```

---

## Contributing

We welcome contributions! Here's how to get started:

1. Fork the repo
2. Create a branch (`git checkout -b feat/my-feature`)
3. Make your changes and commit (`git commit -m 'Add my feature'`)
4. Push to your branch (`git push origin feat/my-feature`)
5. Open a Pull Request

---

## License

MIT
