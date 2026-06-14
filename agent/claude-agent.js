import { EventEmitter } from 'events'
import MemoryManager from '../memory/manager.js'
import { createCronMcpServer, setContext as setCronContext, getScheduler } from '../tools/base/cron.js'
import { createGatewayMcpServer, setGatewayContext } from '../tools/base/gateway.js'
import { createAppleScriptMcpServer } from '../tools/base/applescript.js'
import { createSystemMcpServer } from '../tools/base/system.js'
import { createVoiceMcpServer } from '../tools/base/voice.js'
import { summarizeConversation, shouldSummarize, buildSummarizedContext, estimateTokens } from '../tools/base/summarization.js'
import { createToolRegistryMcpServer } from '../tools/tool-registry.js'

// Lazy-load service tools to reduce initial context
const lazyServiceTools = {
  github: () => import('../tools/services/github.js'),
  'google-tasks': () => import('../tools/services/google-tasks.js'),
  'google-calendar': () => import('../tools/services/google-calendar.js'),
  'microsoft-todo': () => import('../tools/services/microsoft-todo.js'),
  'microsoft-calendar': () => import('../tools/services/microsoft-calendar.js'),
  vercel: () => import('../tools/services/vercel.js'),
  supabase: () => import('../tools/services/supabase.js'),
  search: () => import('../tools/services/search.js'),
  docker: () => import('../tools/services/docker.js')
}
import { getProvider } from '../providers/index.js'
import config from '../config.js'

/**
 * Build the system prompt with memory system info
 */
function buildSystemPrompt(memoryContext, sessionInfo, cronInfo, providerName = 'claude') {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const timeStr = now.toLocaleTimeString('en-US', { hour12: true })

  return `You are Maverick Agent, a personal AI assistant communicating via messaging platforms (WhatsApp, iMessage).

## Current Context
- Date: ${dateStr}
- Time: ${timeStr}
- Session: ${sessionInfo.sessionKey}
- Platform: ${sessionInfo.platform}

## Memory System

You have access to a persistent memory system. Use it to remember important information across conversations.

### Memory Structure
- **MEMORY.md**: Curated long-term memory for important facts, preferences, and decisions
- **Memory/YYYY-MM-DD.md**: Daily notes (append-only log for each day)

### When to Write Memory
- **Only when the user asks** — e.g. "remember this", "save this", "don't forget"
- **Write to MEMORY.md** for: preferences, important decisions, recurring information, relationships, key facts
- **Write to daily log** for: tasks completed, temporary notes, conversation context, things that happened today

### Memory Tools
- Use \`Read\` tool to read memory files from ~/maverick-agent/Memory/
- Use \`Write\` or \`Edit\` tools to update memory files
- Use \`Bash\` with \`mkdir -p ~/maverick-agent/Memory\` if the directory doesn't exist
- Workspace path: ~/maverick-agent/
- All memory files should be .md (markdown)

### Memory Writing Guidelines
1. Be concise but include enough context to be useful later
2. Use markdown headers to organize information
3. Include dates when relevant
4. For MEMORY.md, organize by topic/category
5. For daily logs, use timestamps
6. Do NOT proactively use memory unless the user asks you to remember or recall something

## Current Memory Context
${memoryContext || 'No memory files found yet. Start building your memory!'}

## Scheduling / Reminders

You have cron tools to schedule messages:
- \`mcp__cron__schedule_delayed\`: One-time reminder after delay (seconds)
- \`mcp__cron__schedule_recurring\`: Repeat at interval (seconds)
- \`mcp__cron__schedule_cron\`: Cron expression (minute hour day month weekday)
- \`mcp__cron__list_scheduled\`: List all scheduled jobs
- \`mcp__cron__cancel_scheduled\`: Cancel a job by ID

When user says "remind me in X minutes/hours", use schedule_delayed.
When user says "every day at 9am", use schedule_cron with "0 9 * * *".

### Current Scheduled Jobs
${cronInfo || 'No jobs scheduled'}

## Media Handling

When the user sends media, you will receive it in your context:

### Images
- Describe what you see in the image
- Answer questions about the image
- Extract text from images (OCR)
- Analyze charts, diagrams, screenshots

### Videos
- Describe what's happening in the video
- Answer questions about the video content
- Note timestamps of important moments

### Audio/Voice Notes
- Transcribe spoken content
- Answer questions about the audio
- Respond to voice messages

### Files/Documents
- Read and summarize document contents
- Extract data from spreadsheets
- Analyze code files

## Sending Media

You can send media back to users using the gateway tools:
- \`mcp__gateway__send_image\`: Send images with optional captions
- \`mcp__gateway__send_video\`: Send videos with optional captions
- \`mcp__gateway__send_audio\`: Send audio files or voice notes
- \`mcp__gateway__send_file\`: Send documents and files

When generating or downloading media, save it to ~/maverick-agent/Temp/ first, then send using the appropriate tool.

## Communication Style
- Be helpful and conversational
- Keep responses concise for messaging (avoid walls of text)
- DO NOT use markdown formatting (no **, \`, #, -, etc.) - messaging platforms don't render it
- Use plain text only - write naturally without formatting syntax
- Use emoji sparingly and appropriately
- Remember context from the conversation
- Proactively use tools when needed
- DO NOT mention details about connected accounts (emails, usernames, account IDs) unless explicitly asked - just perform the action silently

## Available Tools

### Base Tools (Always Available)
Built-in: Read, Write, Edit, Bash, Glob, Grep, TodoWrite, Skill
Scheduling: mcp__cron__schedule_delayed, mcp__cron__schedule_recurring, mcp__cron__schedule_cron, mcp__cron__list_scheduled, mcp__cron__cancel_scheduled
Gateway: mcp__gateway__send_message, mcp__gateway__send_image, mcp__gateway__send_video, mcp__gateway__send_audio, mcp__gateway__send_file, mcp__gateway__list_platforms, mcp__gateway__get_queue_status, mcp__gateway__get_current_context, mcp__gateway__list_sessions, mcp__gateway__broadcast_message
System: mcp__system__get_cpu_info, mcp__system__get_memory_info, mcp__system__get_disk_info, mcp__system__get_network_info, mcp__system__get_process_list, mcp__system__get_system_info, mcp__system__kill_process, mcp__system__get_load_average, mcp__system__get_environment, mcp__system__watch_command
Voice: mcp__voice__text_to_speech, mcp__voice__list_voices, mcp__voice__speech_to_text, mcp__voice__list_stt_models
AppleScript (macOS): mcp__applescript__run_script, mcp__applescript__list_apps, mcp__applescript__activate_app, mcp__applescript__display_notification

### Service Tools (Lazy-Loaded via Tool Registry)
Third-party integrations are loaded on demand to save context space.
Use the tool-registry to discover and load services:

1. \`mcp__tool-registry__list_tools\`: List all available tools (filter by category)
2. \`mcp__tool-registry__search_tools\`: Search tools by keyword
3. \`mcp__tool-registry__get_tool_info\`: Get details about a specific tool
4. \`mcp__tool-registry__load_tool\`: Load a service to make its tools available

Available services: github, google-tasks, google-calendar, microsoft-todo, microsoft-calendar, vercel, supabase, search, docker, media

Example workflow:
- User: "Create a GitHub issue"
- You: Call mcp__tool-registry__load_tool with tool_id="github"
- Then use mcp__github__create_issue


## Gateway Tools
- \`mcp__gateway__send_message\`: Send a text message to any chat on any platform
- \`mcp__gateway__send_image\`: Send an image (provide file_path or image_base64)
- \`mcp__gateway__send_video\`: Send a video (provide file_path or video_base64)
- \`mcp__gateway__send_audio\`: Send audio/voice note (provide file_path or audio_base64, set as_voice=true for voice notes)
- \`mcp__gateway__send_file\`: Send a file/document (provide file_path or file_base64)
- \`mcp__gateway__list_platforms\`: List connected platforms
- \`mcp__gateway__get_queue_status\`: Check message queue status
- \`mcp__gateway__get_current_context\`: Get current platform/chat/session info
- \`mcp__gateway__list_sessions\`: List all active sessions
- \`mcp__gateway__broadcast_message\`: Send to multiple chats (use carefully)

## Tool Registry
- \`mcp__tool-registry__list_tools\`: List all available tools (use category="service" for third-party integrations)
- \`mcp__tool-registry__search_tools\`: Search tools by keyword
- \`mcp__tool-registry__get_tool_info\`: Get details about a specific tool
- \`mcp__tool-registry__load_tool\`: Load a service to make its tools available

### How to Use Service Tools
Service tools (GitHub, Tasks, Vercel, Supabase, etc.) are loaded on demand:
1. Call \`mcp__tool-registry__load_tool\` with the service name
2. Once loaded, use the service tools directly
3. Tools stay loaded for the session

Available services: github, google-tasks, google-calendar, microsoft-todo, microsoft-calendar, vercel, supabase, search, docker, media

## System Monitor (Base Tool)
- \`mcp__system__get_cpu_info\`: Get CPU usage and info
- \`mcp__system__get_memory_info\`: Get memory usage
- \`mcp__system__get_disk_info\`: Get disk usage
- \`mcp__system__get_network_info\`: Get network interfaces
- \`mcp__system__get_process_list\`: List top processes
- \`mcp__system__get_system_info\`: Get hostname, OS, uptime
- \`mcp__system__kill_process\`: Kill a process
- \`mcp__system__get_load_average\`: Get system load
- \`mcp__system__get_environment\`: Get environment variables (redacted)
- \`mcp__system__watch_command\`: Run monitoring command

## Voice TTS/STT (Base Tool)
- \`mcp__voice__text_to_speech\`: Convert text to speech (providers: elevenlabs, openai, kokoro, deepgram, fal, replicate)
- \`mcp__voice__list_voices\`: List available voices
- \`mcp__voice__speech_to_text\`: Convert audio to text (providers: groq, openai, deepgram, kokoro, fal, replicate)
- \`mcp__voice__list_stt_models\`: List available STT models

**Auto-Transcription:** Voice messages are automatically transcribed before processing.

## AppleScript (macOS Only, Base Tool)
- \`mcp__applescript__run_script\`: Execute AppleScript code
- \`mcp__applescript__list_apps\`: List running applications
- \`mcp__applescript__activate_app\`: Bring an app to foreground
- \`mcp__applescript__display_notification\`: Show macOS notification

## Session Start (Required)

On every session start, before responding:
1. Read \`SOUL.md\` — your identity, tone, and boundaries
2. Read \`USER.md\` — who you're helping
3. Read \`IDENTITY.md\` — your name, creature, vibe, emoji
4. Read \`MEMORY.md\` from Memory/ — long-term context
5. Read today's log \`Memory/YYYY-MM-DD.md\`
6. Read yesterday's log for continuity
7. Read \`TOOLS.md\` — your environment-specific notes

These files _are_ your memory. You wake up fresh each session. Read them before doing anything else.

## Context Summarization

Long conversations are automatically compacted:
- When conversation exceeds ~80K tokens, older messages are summarized
- Summary is injected into system prompt for continuity
- Recent messages (last 20) are kept in full detail
- Summarization uses Groq (fast, cheap) or falls back to key extraction

## Workspace Structure

Your workspace at ~/maverick-agent/ is organized as follows:

### Root Files
- \`SOUL.md\` — Your identity, personality, and boundaries. Read on startup.
- \`IDENTITY.md\` — Your name, creature type, vibe, and emoji. Read on startup.
- \`USER.md\` — Info about the human you're helping. Read on startup.
- \`TOOLS.md\` — Your environment-specific notes (APIs, services, configs). Read on startup.
- \`MEMORY.md\` — Long-term memory for durable facts, preferences, decisions. Read on startup.
- \`BOOT.md\` — Startup checklist for initialization.
- \`HEARTBEAT.md\` — Periodic task definitions for background monitoring.
- \`BOOTSTRAP.md\` — First-run ritual. Delete after initial setup.

### Directories
- \`Memory/\` — Daily logs (\`YYYY-MM-DD.md\`) and curated long-term memory files
- \`Documents/\` — General documents, notes, text files, PDFs
- \`Development/\` — Code projects, repositories, scripts, active development work
- \`Downloads/\` — Downloaded files from the web or messaging platforms
- \`Media/\` — Images, audio, video files
  - \`Media/Images/\` — Photos, screenshots, diagrams
  - \`Media/Audio/\` — Voice notes, music, sound files
  - \`Media/Video/\` — Video clips, recordings
- \`Projects/\` — Active project files, resources, configs
- \`Archive/\` — Completed or archived work, old versions
- \`Temp/\` — Temporary files, safe to clean up periodically
- \`Automations/\` — Scheduled tasks and cron configurations
  - \`Automations/Jobs/\` — Cron job definitions (\`cron-jobs.json\`)
  - \`Automations/Logs/\` — Execution logs for scheduled tasks
- \`Skills/\` — Custom skill definitions (each skill in its own folder with \`SKILL.md\`)
- \`Tools/\` — Tool scripts and utilities for custom integrations
- \`Agents/\` — Sub-agent definitions for specialized tasks
  - \`architect-agent.md\` — System design and architecture
  - \`backend-dev.md\` — Backend development (APIs, databases, services)
  - \`code-reviewer.md\` — Code review and quality assurance
  - \`data-agent.md\` — Data analysis and processing
  - \`debug-agent.md\` — Debugging and root-cause analysis
  - \`docs-writer.md\` — Technical documentation
  - \`frontend-dev.md\` — Frontend development (UI, components)
  - \`orchestrator-agent.md\` — Multi-agent workflow coordination
  - \`planning-agent.md\` — Strategic planning and task breakdown
  - \`research-agent.md\` — Deep research and information gathering
  - \`security-auditor.md\` — Security vulnerability auditing
  - \`test-writer.md\` — Test generation
- \`Chats/\` — Chat history and session transcripts (JSONL format)

### Usage Guidelines
- Use \`Memory/\` for anything you need to remember across sessions
- Use \`Development/\` for code projects you're working on
- Use \`Temp/\` for files that don't need to persist
- Use \`Archive/\` instead of deleting — you might need it later
- Create subdirectories within folders as needed for organization

## Important
- The workspace at ~/maverick-agent/ is your home — use it to store files and memory
- Memory lives in ~/maverick-agent/Memory/ — always check before asking for info
- Read SOUL.md, USER.md, IDENTITY.md at session start — they define who you are
- Scheduled tasks go in ~/maverick-agent/Automations/Jobs/
- Custom skills go in ~/maverick-agent/Skills/
- Always check memory before asking the user for information they may have already told you
- Update memory when you learn new persistent information about the user
- When user asks to be reminded, use the cron scheduling tools

## Platform Switching / Starting Gateway
When the user says things like "can I text you on WhatsApp?" or "I'm going outside, let me message you on WhatsApp":
- This means they want to continue the conversation on WhatsApp
- You need to START the Maverick Agent gateway so you can receive WhatsApp messages
- Run this command to start the gateway in the background:
  \`cd ~/maverick-agent && npm start > /tmp/maverick-agent.log 2>&1 &\`
- After starting, confirm: "Gateway started! You can message me on WhatsApp now."
- The gateway will show a QR code in the logs if WhatsApp needs to be connected - tell the user to check /tmp/maverick-agent.log if needed
`
}

/**
 * Claude Agent using the Claude Agent SDK
 * With memory system and cron MCP server
 */
export default class ClaudeAgent extends EventEmitter {
  constructor(config = {}) {
    super()
    this.memoryManager = new MemoryManager()
    this.cronMcpServer = createCronMcpServer()
    this.cronScheduler = getScheduler()
    this.gatewayMcpServer = createGatewayMcpServer()
    this.systemMcpServer = createSystemMcpServer()
    this.voiceMcpServer = createVoiceMcpServer()

    // Tool registry always loaded - critical for service discovery
    try {
      this.toolRegistryMcpServer = createToolRegistryMcpServer()
    } catch (err) {
      console.error('[ClaudeAgent] Failed to create tool registry:', err.message)
      this.toolRegistryMcpServer = null
    }

    // Lazy-loaded service tool servers
    this.serviceMcpServers = {}
    this.serviceLoaders = {
      github: () => import('../tools/services/github.js').then(m => m.createGitHubMcpServer()),
      'google-tasks': () => import('../tools/services/google-tasks.js').then(m => m.createGoogleTasksMcpServer()),
      'google-calendar': () => import('../tools/services/google-calendar.js').then(m => m.createGoogleCalendarMcpServer()),
      'microsoft-todo': () => import('../tools/services/microsoft-todo.js').then(m => m.createMicrosoftTodoMcpServer()),
      'microsoft-calendar': () => import('../tools/services/microsoft-calendar.js').then(m => m.createMicrosoftCalendarMcpServer()),
      vercel: () => import('../tools/services/vercel.js').then(m => m.createVercelMcpServer()),
      supabase: () => import('../tools/services/supabase.js').then(m => m.createSupabaseMcpServer()),
      search: () => import('../tools/services/search.js').then(m => m.createSearchMcpServer()),
      docker: () => import('../tools/services/docker.js').then(m => m.createDockerMcpServer()),
      media: () => import('../tools/services/media.js').then(m => m.createMediaMcpServer())
    }

    this.gateway = null // Set by gateway after construction
    this.sessions = new Map()
    this.abortControllers = new Map()

    // Provider setup
    this.providerName = config.provider || 'claude'
    const providerConfig = {
      allowedTools: config.allowedTools,
      maxTurns: config.maxTurns,
      permissionMode: config.permissionMode,
    }
    if (this.providerName === 'opencode') {
      Object.assign(providerConfig, config.opencode || {})
    }
    this.provider = getProvider(this.providerName, providerConfig)

    this.allowedTools = config.allowedTools || [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
      'TodoWrite', 'Skill', 'AskUserQuestion'
    ]

    // Add cron MCP tools to allowed list
    this.cronTools = [
      'mcp__cron__schedule_delayed',
      'mcp__cron__schedule_recurring',
      'mcp__cron__schedule_cron',
      'mcp__cron__list_scheduled',
      'mcp__cron__cancel_scheduled'
    ]

    // Add gateway MCP tools to allowed list
    this.gatewayTools = [
      'mcp__gateway__send_message',
      'mcp__gateway__send_image',
      'mcp__gateway__send_video',
      'mcp__gateway__send_audio',
      'mcp__gateway__send_file',
      'mcp__gateway__list_platforms',
      'mcp__gateway__get_queue_status',
      'mcp__gateway__get_current_context',
      'mcp__gateway__list_sessions',
      'mcp__gateway__broadcast_message'
    ]

    // AppleScript tools (macOS only)
    this.applescriptMcpServer = createAppleScriptMcpServer()
    this.applescriptTools = this.applescriptMcpServer ? [
      'mcp__applescript__run_script',
      'mcp__applescript__list_apps',
      'mcp__applescript__activate_app',
      'mcp__applescript__display_notification'
    ] : []

    // Service tool definitions (lazy-loaded)
    this.serviceToolDefs = {
      github: [
        'mcp__github__get_authenticated_user',
        'mcp__github__list_repos',
        'mcp__github__get_repo',
        'mcp__github__create_repo',
        'mcp__github__list_issues',
        'mcp__github__get_issue',
        'mcp__github__create_issue',
        'mcp__github__update_issue',
        'mcp__github__list_pull_requests',
        'mcp__github__get_pull_request',
        'mcp__github__create_pull_request',
        'mcp__github__create_comment',
        'mcp__github__list_commits',
        'mcp__github__get_file_contents',
        'mcp__github__create_or_update_file',
        'mcp__github__list_workflows',
        'mcp__github__list_workflow_runs',
        'mcp__github__trigger_workflow',
        'mcp__github__search_repos',
        'mcp__github__search_code'
      ],
      'google-tasks': [
        'mcp__tasks__list_task_lists',
        'mcp__tasks__get_task_list',
        'mcp__tasks__create_task_list',
        'mcp__tasks__update_task_list',
        'mcp__tasks__delete_task_list',
        'mcp__tasks__list_tasks',
        'mcp__tasks__get_task',
        'mcp__tasks__create_task',
        'mcp__tasks__update_task',
        'mcp__tasks__complete_task',
        'mcp__tasks__uncomplete_task',
        'mcp__tasks__delete_task',
        'mcp__tasks__clear_completed',
        'mcp__tasks__move_task'
      ],
      'microsoft-todo': [
        'mcp__microsoft-todo__list_task_lists',
        'mcp__microsoft-todo__get_task_list',
        'mcp__microsoft-todo__create_task_list',
        'mcp__microsoft-todo__update_task_list',
        'mcp__microsoft-todo__delete_task_list',
        'mcp__microsoft-todo__list_tasks',
        'mcp__microsoft-todo__get_task',
        'mcp__microsoft-todo__create_task',
        'mcp__microsoft-todo__update_task',
        'mcp__microsoft-todo__complete_task',
        'mcp__microsoft-todo__uncomplete_task',
        'mcp__microsoft-todo__delete_task'
      ],
      vercel: [
        'mcp__vercel__list_projects',
        'mcp__vercel__get_project',
        'mcp__vercel__create_project',
        'mcp__vercel__delete_project',
        'mcp__vercel__list_deployments',
        'mcp__vercel__get_deployment',
        'mcp__vercel__create_deployment',
        'mcp__vercel__cancel_deployment',
        'mcp__vercel__list_domains',
        'mcp__vercel__add_domain',
        'mcp__vercel__remove_domain',
        'mcp__vercel__get_deployment_logs',
        'mcp__vercel__get_analytics',
        'mcp__vercel__get_analytics_metrics',
        'mcp__vercel__get_web_vitals'
      ],
      supabase: [
        'mcp__supabase__list_tables',
        'mcp__supabase__query_table',
        'mcp__supabase__insert_rows',
        'mcp__supabase__update_rows',
        'mcp__supabase__delete_rows',
        'mcp__supabase__execute_sql',
        'mcp__supabase__list_storage_buckets',
        'mcp__supabase__list_storage_files',
        'mcp__supabase__upload_file',
        'mcp__supabase__get_table_schema'
    ] : []

    // Search tools
    this.searchTools = this.searchMcpServer ? [
      'mcp__search__web_search',
      'mcp__search__news_search',
      'mcp__search__image_search',
      'mcp__search__video_search'
    ],
    'google-calendar': [
      'mcp__calendar__list_calendars',
      'mcp__calendar__get_calendar',
      'mcp__calendar__list_events',
      'mcp__calendar__get_event',
      'mcp__calendar__create_event',
      'mcp__calendar__update_event',
      'mcp__calendar__delete_event',
      'mcp__calendar__get_todays_events',
      'mcp__calendar__get_upcoming_events',
      'mcp__calendar__quick_add_event',
      'mcp__calendar__list_event_colors'
    ],
    'microsoft-calendar': [
      'mcp__microsoft-calendar__list_calendars',
      'mcp__microsoft-calendar__get_calendar',
      'mcp__microsoft-calendar__list_events',
      'mcp__microsoft-calendar__get_event',
      'mcp__microsoft-calendar__create_event',
      'mcp__microsoft-calendar__update_event',
      'mcp__microsoft-calendar__delete_event',
      'mcp__microsoft-calendar__get_todays_events',
      'mcp__microsoft-calendar__get_upcoming_events'
    ],
    docker: [
      'mcp__docker__list_containers',
      'mcp__docker__get_container',
      'mcp__docker__start_container',
      'mcp__docker__stop_container',
      'mcp__docker__restart_container',
      'mcp__docker__remove_container',
      'mcp__docker__container_logs',
      'mcp__docker__exec_command',
      'mcp__docker__list_images',
      'mcp__docker__pull_image',
      'mcp__docker__remove_image',
      'mcp__docker__compose_up',
      'mcp__docker__compose_down',
      'mcp__docker__compose_logs',
      'mcp__docker__system_info'
    ],
    media: [
      'mcp__media__generate_image',
      'mcp__media__list_image_models',
      'mcp__media__generate_video',
      'mcp__media__list_video_models',
      'mcp__media__upscale'
    ]
    }

    // System tools (base - always loaded)
    this.systemTools = this.systemMcpServer ? [
      'mcp__system__get_cpu_info',
      'mcp__system__get_memory_info',
      'mcp__system__get_disk_info',
      'mcp__system__get_network_info',
      'mcp__system__get_process_list',
      'mcp__system__get_system_info',
      'mcp__system__kill_process',
      'mcp__system__get_load_average',
      'mcp__system__get_environment',
      'mcp__system__watch_command'
    ] : []

    // Voice tools (base - always loaded)
    this.voiceTools = this.voiceMcpServer ? [
      'mcp__voice__text_to_speech',
      'mcp__voice__list_voices',
      'mcp__voice__speech_to_text',
      'mcp__voice__list_stt_models'
    ] : []

    // Tool registry tools - always included (critical for service discovery)
    this.toolRegistryTools = [
      'mcp__tool-registry__list_tools',
      'mcp__tool-registry__search_tools',
      'mcp__tool-registry__get_tool_info',
      'mcp__tool-registry__load_tool'
    ]

    this.maxTurns = config.maxTurns || 50
    this.permissionMode = config.permissionMode || 'default'

    // Forward cron events
    this.cronScheduler.on('execute', (data) => this.emit('cron:execute', data))
  }

  /**
   * Dynamically load a service tool at runtime
   * @param {string} serviceName - Service to load (e.g., 'github', 'vercel')
   * @returns {boolean} - Whether the service was successfully loaded
   */
  async loadService(serviceName) {
    if (this.serviceMcpServers[serviceName]) {
      return true // Already loaded
    }

    if (!this.serviceLoaders[serviceName]) {
      console.error(`[ClaudeAgent] Unknown service: ${serviceName}`)
      return false
    }

    try {
      console.log(`[ClaudeAgent] Loading service: ${serviceName}`)
      this.serviceMcpServers[serviceName] = await this.serviceLoaders[serviceName]()
      if (this.serviceMcpServers[serviceName]) {
        console.log(`[ClaudeAgent] Service loaded: ${serviceName}`)
        return true
      }
      return false
    } catch (err) {
      console.error(`[ClaudeAgent] Failed to load service ${serviceName}:`, err.message)
      return false
    }
  }

  /**
   * Get list of available services and their load status
   */
  getAvailableServices() {
    return Object.keys(this.serviceLoaders).map(name => ({
      name,
      loaded: !!this.serviceMcpServers[name],
      tools: this.serviceToolDefs[name] || []
    }))
  }

  getSession(sessionKey) {
    if (!this.sessions.has(sessionKey)) {
      this.sessions.set(sessionKey, {
        sdkSessionId: null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
        messages: [], // Conversation history for summarization
        summary: null // Compacted summary
      })
    }
    return this.sessions.get(sessionKey)
  }

  /**
   * Add message to session history and auto-compact if needed
   */
  async addToHistory(session, role, content) {
    session.messages.push({ role, content, timestamp: Date.now() })

    // Auto-compact if conversation is getting long
    if (shouldSummarize(session.messages, 80000)) {
      console.log(`[Agent] Auto-compacting conversation (${session.messages.length} messages)`)
      try {
        const result = await summarizeConversation(session.messages)
        if (result.summary) {
          session.summary = result.summary
          session.messages = result.recentMessages
          console.log(`[Agent] Compacted to ${session.messages.length} messages`)
        }
      } catch (err) {
        console.error('[Agent] Summarization failed:', err.message)
      }
    }
  }

  abort(sessionKey) {
    // Delegate abort to the provider
    return this.provider.abort(sessionKey)
  }

  getCronSummary() {
    const jobs = this.cronScheduler.list()
    if (jobs.length === 0) return null
    return jobs.map(j => `- ${j.id}: ${j.description} (${j.type})`).join('\n')
  }

  /**
   * Build prompt - supports images for vision
   */
  buildPrompt(message, image) {
    if (!image) return message

    return [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mediaType,
          data: image.data
        }
      },
      {
        type: 'text',
        text: message
      }
    ]
  }

  /**
   * Generate streaming messages for the SDK
   */
  async *generateMessages(message, image) {
    yield {
      type: 'user',
      message: {
        role: 'user',
        content: this.buildPrompt(message, image)
      }
    }
  }

  /**
   * Run the agent for a message
   */
  async *run(params) {
    const {
      message,
      sessionKey,
      platform = 'unknown',
      chatId = null,
      image = null,
      mcpServers = {},
      canUseTool
    } = params

    const session = this.getSession(sessionKey)
    session.lastActivity = Date.now()
    session.messageCount++

    // Add user message to history
    await this.addToHistory(session, 'user', message)

    // Set cron context for scheduled messages
    setCronContext({ platform, chatId, sessionKey })

    // Set gateway context
    setGatewayContext({
      gateway: this.gateway,
      currentPlatform: platform,
      currentChatId: chatId,
      currentSessionKey: sessionKey
    })

    // Build system prompt
    const memoryContext = this.memoryManager.getMemoryContext()
    const cronInfo = this.getCronSummary()
    const conversationSummary = session.summary ? `\n\n## Previous Conversation Summary\n${session.summary}` : ''
    const systemPrompt = buildSystemPrompt(memoryContext, { sessionKey, platform }, cronInfo, this.providerName) + conversationSummary

    // Base tools always allowed + tool registry
    const allAllowedTools = [
      ...this.allowedTools,
      ...this.cronTools,
      ...this.gatewayTools,
      ...this.applescriptTools,
      ...this.systemTools,
      ...this.voiceTools,
      ...this.toolRegistryTools
    ]

    // Build MCP servers - base tools always loaded, services lazy via tool-registry
    const allMcpServers = {
      // Tool registry - always first, critical for service discovery
      ...(this.toolRegistryMcpServer ? { 'tool-registry': this.toolRegistryMcpServer } : {}),
      // Base tools (always loaded)
      ...(this.cronMcpServer ? { cron: this.cronMcpServer } : {}),
      ...(this.gatewayMcpServer ? { gateway: this.gatewayMcpServer } : {}),
      ...(this.systemMcpServer ? { system: this.systemMcpServer } : {}),
      ...(this.voiceMcpServer ? { voice: this.voiceMcpServer } : {}),
      ...mcpServers
    }

    // Lazy-load requested services
    const requestedServices = config.loadServices || []
    for (const serviceName of requestedServices) {
      if (this.serviceLoaders[serviceName] && !this.serviceMcpServers[serviceName]) {
        try {
          this.serviceMcpServers[serviceName] = await this.serviceLoaders[serviceName]()
          if (this.serviceMcpServers[serviceName]) {
            allMcpServers[serviceName] = this.serviceMcpServers[serviceName]
            // Add service tools to allowed list
            if (this.serviceToolDefs[serviceName]) {
              allAllowedTools.push(...this.serviceToolDefs[serviceName])
            }
          }
        } catch (err) {
          console.error(`[ClaudeAgent] Failed to load service ${serviceName}:`, err.message)
        }
      }
    }

    if (image) console.log('[ClaudeAgent] With image attachment')

    this.emit('run:start', { sessionKey, message, hasImage: !!image })

    try {
      let fullText = ''
      let hasStreamedContent = false

      // Delegate to provider - pass prompt and all options
      const queryParams = {
        prompt: this.generateMessages(message, image),
        chatId: sessionKey,
        mcpServers: allMcpServers,
        allowedTools: allAllowedTools,
        maxTurns: this.maxTurns,
        systemPrompt,
        permissionMode: this.permissionMode
      }
      if (canUseTool) {
        queryParams.canUseTool = canUseTool
      }
      for await (const chunk of this.provider.query(queryParams)) {
        // Handle streaming partial messages (token-level streaming)
        if (chunk.type === 'stream_event' && chunk.event) {
          const event = chunk.event
          hasStreamedContent = true

          // Text delta - stream individual tokens
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text
            if (text) {
              fullText += text
              yield { type: 'text', content: text, isReasoning: !!event.isReasoning }
              this.emit('run:text', { sessionKey, content: text })
            }
          }
          // Tool use start
          else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            yield {
              type: 'tool_use',
              name: event.content_block.name,
              input: event.content_block.input || {},
              id: event.content_block.id
            }
            this.emit('run:tool', { sessionKey, name: event.content_block.name })
          }
          continue
        }

        // Handle complete assistant messages (only if we haven't streamed content)
        if (chunk.type === 'assistant' && chunk.message?.content) {
          for (const block of chunk.message.content) {
            if (block.type === 'text' && block.text && !hasStreamedContent) {
              fullText += block.text
              yield { type: 'text', content: block.text }
              this.emit('run:text', { sessionKey, content: block.text })
            } else if (block.type === 'tool_use') {
              if (!hasStreamedContent) {
                yield { type: 'tool_use', name: block.name, input: block.input, id: block.id }
                this.emit('run:tool', { sessionKey, name: block.name })
              }
            }
          }
          continue
        }

        // Handle tool results
        if (chunk.type === 'tool_result' || chunk.type === 'result') {
          yield { type: 'tool_result', result: chunk.result || chunk.content }
          continue
        }

        // Handle done/aborted/error from provider
        if (chunk.type === 'done') {
          break
        }
        if (chunk.type === 'aborted') {
          // silently handle abort
          yield { type: 'aborted' }
          this.emit('run:aborted', { sessionKey })
          return
        }
        if (chunk.type === 'error') {
          yield { type: 'error', error: chunk.error }
          this.emit('run:error', { sessionKey, error: chunk.error })
          return
        }

        if (chunk.type !== 'system') {
          yield chunk
        }
      }

      yield { type: 'done', fullText }
      this.emit('run:complete', { sessionKey, response: fullText })

      // Add assistant response to history
      if (fullText) {
        await this.addToHistory(session, 'assistant', fullText)
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        // silently handle abort
        yield { type: 'aborted' }
        this.emit('run:aborted', { sessionKey })
      } else {
        console.error('[ClaudeAgent] Error:', error)
        yield { type: 'error', error: error.message }
        this.emit('run:error', { sessionKey, error })
        throw error
      }
    }
  }

  /**
   * Run and collect full response
   */
  async runAndCollect(params) {
    let fullText = ''
    for await (const chunk of this.run(params)) {
      if (chunk.type === 'text') {
        fullText += chunk.content
      }
      if (chunk.type === 'done') {
        return chunk.fullText || fullText
      }
      if (chunk.type === 'error') {
        throw new Error(chunk.error)
      }
    }
    return fullText
  }

  stopCron() {
    this.cronScheduler.stop()
  }
}
