# SYSTEM DESIGN — Maverick Agent

## High-Level Architecture

```
┌─────────────────────────────────────┐
│          User Interface              │
│  (CLI / TTY / Voice / MCP Client)   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│           Agent Runtime              │
│  ┌───────────────────────────────┐  │
│  │       Session Loop             │  │
│  │  ┌──────┐  ┌──────┐ ┌──────┐ │  │
│  │  │Input │→ │LLM   │→│Tool  │ │  │
│  │  │Parse │  │Route │ │Exec  │ │  │
│  │  └──────┘  └──────┘ └──────┘ │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │       Tool Registry            │  │
│  │  terminal · file · web · mcp  │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │       Skill Manager            │  │
│  │  load · scope · lifecycle     │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │       Memory Store             │  │
│  │  SQLite / JSON / ephemeral    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│          Model Providers             │
│  OpenAI · Anthropic · Local (llama) │
└─────────────────────────────────────┘
```

## Core Components

### 1. Agent Runtime
- **Session Loop:** read input → build prompt → call LLM → parse response → execute tools → repeat
- **Streaming:** real-time token output with tool call streaming
- **Interrupts:** Ctrl+C, tool timeouts, rate limiting

### 2. Tool Registry
- Plugin-based tool loading
- Each tool: name, description, input schema, execute function
- Built-in: `terminal`, `read_file`, `write_file`, `search_files`, `web_search`, `web_extract`

### 3. Skill Manager
- Load skills from markdown files (SKILL.md format)
- Skills inject system-prompt context and task-specific behavior
- Lifecycle: install, enable, disable, remove

### 4. Memory Store
- Persistent key-value store (SQLite)
- Session memory, user profile, conversation history
- Auto-summarization for long sessions

### 5. Model Router
- Abstract LLM provider interface
- Support: OpenAI-compatible API, Anthropic, local GGUF (llama.cpp)
- Fallback chain, cost tracking

## Package Dependencies

- `bun` — runtime and package manager
- `zod` — input validation
- `better-sqlite3` — memory store
- `openai` / `@anthropic-ai/sdk` — model providers
- `commander` — CLI

## Directory Structure

```
maverick-agent/
├── src/
│   ├── cli/          # CLI entry point
│   ├── runtime/      # Session loop, execution
│   ├── tools/        # Tool implementations
│   ├── skills/       # Skill manager
│   ├── memory/       # Persistence
│   ├── providers/    # Model providers
│   └── mcp/          # MCP protocol support
├── skills/           # Bundled skill files
├── PRD.md
├── SYSTEM-DESIGN.md
├── AGENTS.md
└── README.md
```
