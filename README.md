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

**Deep integrations.** [GitHub](#github) repos/PRs/issues, [Google Tasks](#google-tasks) & [Calendar](#google-calendar), [Vercel](#vercel) deploys, [Supabase](#supabase) queries, [Brave Search](#brave-search), [Docker](#docker) management.

**15+ built-in tools.** File operations, web search, code execution, voice (TTS/STT), system monitoring, and more.

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

### GitHub

Native GitHub integration using Personal Access Token.

**Setup:**
1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Create a token with permissions: `repo`, `workflow`, `read:org`
3. Add to `.env`:

```
GITHUB_PAT=ghp_...
```

**Capabilities:** Repos, issues, PRs, commits, workflows, code search.

---

### Google Tasks

Native Google Tasks for todo management.

**Setup:**
1. Create a Google Cloud project and enable the Tasks API
2. Create OAuth2 credentials
3. Add to `.env`:

```
GOOGLE_TASKS_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_TASKS_CLIENT_SECRET=your-client-secret
GOOGLE_TASKS_REFRESH_TOKEN=your-refresh-token
```

---

### Google Calendar

Native Google Calendar for event management.

**Setup:**
1. Same as Google Tasks but with Calendar API scope enabled
2. Add to `.env`:

```
GOOGLE_CALENDAR_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=your-client-secret
GOOGLE_CALENDAR_REFRESH_TOKEN=your-refresh-token
```

---

### Microsoft To Do

Alternative to Google Tasks.

**Setup:**
1. Create an Azure AD app registration
2. Enable Microsoft To Do API permissions
3. Add to `.env`:

```
TODO_PROVIDER=microsoft
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_REFRESH_TOKEN=your-refresh-token
```

---

### Microsoft Outlook Calendar

Alternative to Google Calendar.

**Setup:**
1. Same Azure AD app as Microsoft To Do, with Calendar API scope
2. Add to `.env`:

```
CALENDAR_PROVIDER=microsoft
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_REFRESH_TOKEN=your-refresh-token
```

---

### Vercel

Deploy and manage Vercel projects.

**Setup:**
1. Go to [vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Create an API token
3. Add to `.env`:

```
VERCEL_TOKEN=your-vercel-token
```

**Capabilities:** Deploy projects, list deployments, get project info.

---

### Supabase

Query Supabase databases directly.

**Setup:**
1. Go to your Supabase project Settings > API
2. Copy the project URL and keys
3. Add to `.env`:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

---

### Brave Search

Web, news, image, and video search.

**Setup:**
1. Go to [brave.com/search/api](https://brave.com/search/api/)
2. Get an API key
3. Add to `.env`:

```
BRAVE_API_KEY=your-brave-api-key
```

---

### Docker

Manage containers, images, and compose stacks.

**Requirements:** Docker must be installed on the host machine.

```bash
# Verify Docker is available
docker --version
```

No API key needed — the tool communicates with the local Docker daemon.

---

### System Monitor

CPU, memory, disk, network, and process monitoring. Built-in, no setup required.

---

### Voice (TTS/STT)

Text-to-speech and speech-to-text with multiple providers.

**Supported providers:**

| Provider | TTS | STT |
|----------|-----|-----|
| ElevenLabs | Yes | No |
| Groq | No | Yes |
| FAL | Yes | Yes |
| Replicate | Yes | Yes |
| OpenAI | Yes | Yes |
| Deepgram | No | Yes |
| Kokoro | Yes | No |

**Setup:**
1. Choose your providers in `.env`:

```
TTS_PROVIDER=elevenlabs    # elevenlabs, fal, replicate, openai, kokoro, deepgram
STT_PROVIDER=groq          # groq, fal, replicate, openai, deepgram, kokoro
```

2. Add the corresponding API keys:

```
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_VOICE_ID=your-default-voice-id
FAL_API_KEY=your-fal-api-key
REPLICATE_API_TOKEN=your-replicate-token
GROQ_API_KEY=your-groq-api-key
OPENAI_API_KEY=your-openai-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
KOKORO_API_URL=http://localhost:8880
KOKORO_ENABLED=true
```

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

- [X / Twitter](https://x.com/justmalhar) — follow for updates
- [GitHub Issues](https://github.com/Justmalhar/maverick-agent/issues) — bug reports and feature requests
- [Pull Requests](https://github.com/Justmalhar/maverick-agent/pulls) — contributions welcome

---

## License

MIT — see [LICENSE](https://github.com/Justmalhar/maverick-agent/blob/main/LICENSE).

Built by [Malhar Ujawane](https://x.com/justmalhar).
