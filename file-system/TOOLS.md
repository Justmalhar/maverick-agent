# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## Tools Architecture

Tools are organized into two categories:

### Base Tools (Always Loaded)
Core tools available in every session without additional API calls:

| Tool | Description |
|------|-------------|
| `applescript` | macOS automation via AppleScript |
| `cron` | Schedule recurring tasks and jobs |
| `gateway` | Control agent messaging gateway |
| `system` | Monitor system resources (CPU, memory, disk) |
| `voice` | Text-to-speech and speech-to-text |
| `tool-registry` | Discover and load service tools on demand |

### Service Tools (Lazy-Loaded)
Third-party integrations loaded only when needed via `tool-registry`:

| Tool | Category | Requires |
|------|----------|----------|
| `github` | DevOps | `GITHUB_PAT` |
| `google-tasks` | Productivity | Google OAuth2 |
| `google-calendar` | Productivity | Google OAuth2 |
| `microsoft-todo` | Productivity | Microsoft OAuth2 |
| `microsoft-calendar` | Productivity | Microsoft OAuth2 |
| `vercel` | Hosting | `VERCEL_TOKEN` |
| `supabase` | Database | Supabase keys |
| `search` | Research | `BRAVE_API_KEY` |
| `docker` | DevOps | Docker socket |

### How Lazy Loading Works

1. Agent starts with base tools only (small context footprint)
2. When agent needs a service, it calls `tool-registry.list_tools` to discover available tools
3. Agent calls `tool-registry.load_tool` with the service name
4. Service MCP server is loaded and its tools become available
5. Subsequent turns can use the loaded service tools

This prevents context bloat from loading all 100+ tool schemas upfront.

## Active Services

### GitHub
- Username: justmalhar
- PAT configured for repo, issues, PRs, workflows

### Vercel
- Token configured for project management and analytics

### Supabase
- URL and keys configured for database operations

### Brave Search
- API key configured for web search

### Voice
- TTS: ElevenLabs, Fal.ai, Replicate, OpenAI, Kokoro, Deepgram
- STT: Groq, Fal.ai, Replicate, OpenAI, Deepgram, Kokoro

### Calendar & Tasks
- Provider: Google (configurable to Microsoft)

## Environment Variables

```bash
# Voice Providers
TTS_PROVIDER=elevenlabs
STT_PROVIDER=groq
OPENAI_API_KEY=
DEEPGRAM_API_KEY=
KOKORO_API_URL=http://localhost:8880

# Service Providers
GITHUB_PAT=
VERCEL_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
BRAVE_API_KEY=
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
