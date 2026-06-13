# PRD — Maverick Agent

## Vision

A self-hosted, extensible AI agent harness that lives alongside the Maverick ecosystem — managing tools, skills, memory, and model routing with minimal overhead. Like Hermes Agent, but purpose-built for the Maverick stack.

## Goals (v0.1)

1. **Agent runtime** — CLI-driven agent with tool-use capabilities
2. **Plugin system** — Load tools and skills dynamically
3. **Model routing** — Connect to any LLM provider (OpenAI, Anthropic, local models)
4. **Tool execution** — Run shell commands, read/write files, browse the web
5. **Memory** — Persistent context that survives across sessions
6. **MCP support** — Expose and consume MCP tools
7. **Maverick integration** — Plug into maverick-voice, maverick-tty, maverick-cli

## Non-Goals

- Not a full IDE or coding assistant
- Not a replacement for system-level orchestration
- Not a hosted SaaS

## Roadmap

### Phase 1 — Core Runtime
- [ ] CLI entry point with config
- [ ] Model provider abstraction
- [ ] Basic tool execution (terminal, file, web)
- [ ] Session loop (user input → LLM → tool call → response)

### Phase 2 — Skills & Plugins
- [ ] Skill loading system
- [ ] Tool registry
- [ ] Memory / persistent store

### Phase 3 — Integration
- [ ] MCP protocol support
- [ ] Maverick ecosystem bridge
- [ ] Voice-in/voice-out pipeline
