import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

// Lazy-loaded tool modules
const toolModules = {
  // Base tools
  applescript: () => import('./base/applescript.js'),
  cron: () => import('./base/cron.js'),
  gateway: () => import('./base/gateway.js'),
  system: () => import('./base/system.js'),
  summarization: () => import('./base/summarization.js'),
  transcription: () => import('./base/transcription.js'),
  voice: () => import('./base/voice.js'),
  // Service tools
  github: () => import('./services/github.js'),
  'google-tasks': () => import('./services/google-tasks.js'),
  'google-calendar': () => import('./services/google-calendar.js'),
  'microsoft-todo': () => import('./services/microsoft-todo.js'),
  'microsoft-calendar': () => import('./services/microsoft-calendar.js'),
  vercel: () => import('./services/vercel.js'),
  supabase: () => import('./services/supabase.js'),
  search: () => import('./services/search.js'),
  docker: () => import('./services/docker.js'),
  media: () => import('./services/media.js')
}

const toolMetadata = {
  applescript: {
    name: 'AppleScript',
    category: 'base',
    description: 'macOS automation via AppleScript - control apps, system actions, UI scripting',
    requires: ['macOS'],
    keywords: ['macos', 'automation', 'app', 'ui', 'script']
  },
  cron: {
    name: 'Cron Scheduler',
    category: 'base',
    description: 'Schedule recurring tasks and background jobs',
    requires: [],
    keywords: ['schedule', 'cron', 'timer', 'recurring', 'background']
  },
  gateway: {
    name: 'Gateway Control',
    category: 'base',
    description: 'Control the agent gateway, manage connections, send messages',
    requires: [],
    keywords: ['gateway', 'connection', 'message', 'send']
  },
  system: {
    name: 'System Monitor',
    category: 'base',
    description: 'Monitor system resources, processes, disk usage, network',
    requires: [],
    keywords: ['system', 'monitor', 'cpu', 'memory', 'disk', 'process']
  },
  summarization: {
    name: 'Conversation Summarizer',
    category: 'base',
    description: 'Summarize conversations to manage context window',
    requires: [],
    keywords: ['summarize', 'context', 'conversation', 'compress']
  },
  transcription: {
    name: 'Audio Transcriber',
    category: 'base',
    description: 'Transcribe audio files to text',
    requires: ['GROQ_API_KEY'],
    keywords: ['transcribe', 'audio', 'speech', 'whisper']
  },
  voice: {
    name: 'Voice TTS/STT',
    category: 'base',
    description: 'Text-to-speech and speech-to-text with multiple providers',
    requires: ['API_KEY for provider'],
    keywords: ['tts', 'stt', 'voice', 'speech', 'kokoro', 'openai', 'elevenlabs']
  },
  github: {
    name: 'GitHub',
    category: 'service',
    description: 'GitHub API - repos, issues, PRs, actions, code search',
    requires: ['GITHUB_PAT'],
    keywords: ['github', 'repo', 'issue', 'pr', 'pull request', 'action', 'git']
  },
  'google-tasks': {
    name: 'Google Tasks',
    category: 'service',
    description: 'Google Tasks API - manage task lists and tasks',
    requires: ['GOOGLE_TASKS_CLIENT_ID', 'GOOGLE_TASKS_CLIENT_SECRET'],
    keywords: ['google', 'tasks', 'todo', 'list', 'task']
  },
  'google-calendar': {
    name: 'Google Calendar',
    category: 'service',
    description: 'Google Calendar API - manage events and calendars',
    requires: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET'],
    keywords: ['google', 'calendar', 'event', 'schedule', 'meeting']
  },
  'microsoft-todo': {
    name: 'Microsoft To Do',
    category: 'service',
    description: 'Microsoft To Do API - manage tasks and lists',
    requires: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    keywords: ['microsoft', 'todo', 'tasks', 'outlook']
  },
  'microsoft-calendar': {
    name: 'Microsoft Outlook Calendar',
    category: 'service',
    description: 'Microsoft Outlook Calendar API - manage events',
    requires: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    keywords: ['microsoft', 'outlook', 'calendar', 'event', 'meeting']
  },
  vercel: {
    name: 'Vercel',
    category: 'service',
    description: 'Vercel API - deploy, manage projects, view analytics',
    requires: ['VERCEL_TOKEN'],
    keywords: ['vercel', 'deploy', 'hosting', 'analytics', 'project']
  },
  supabase: {
    name: 'Supabase',
    category: 'service',
    description: 'Supabase API - database queries, auth, storage',
    requires: ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
    keywords: ['supabase', 'database', 'postgres', 'auth', 'storage']
  },
  search: {
    name: 'Brave Search',
    category: 'service',
    description: 'Web search via Brave Search API',
    requires: ['BRAVE_API_KEY'],
    keywords: ['search', 'web', 'brave', 'query', 'find']
  },
  docker: {
    name: 'Docker',
    category: 'service',
    description: 'Docker API - manage containers, images, volumes',
    requires: [],
    keywords: ['docker', 'container', 'image', 'volume', 'compose']
  },
  media: {
    name: 'Media Generation',
    category: 'service',
    description: 'Image and video generation, upscaling via fal.ai (FLUX, GPT Image, Seedance, Topaz)',
    requires: ['FAL_API_KEY'],
    keywords: ['image', 'video', 'generate', 'upscale', 'flux', 'gpt-image', 'seedance', 'topaz', 'nano-banana', 'ideogram', 'recraft']
  }
}

// Cache for loaded MCP servers
const serverCache = new Map()

async function getToolServer(toolName) {
  if (serverCache.has(toolName)) {
    return serverCache.get(toolName)
  }

  const loader = toolModules[toolName]
  if (!loader) {
    throw new Error(`Unknown tool: ${toolName}`)
  }

  const module = await loader()
  const createFn = module.default || module[`create${toolName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}McpServer`]

  if (!createFn) {
    throw new Error(`No MCP server creator found for tool: ${toolName}`)
  }

  const server = createFn()
  if (server) {
    serverCache.set(toolName, server)
  }
  return server
}

export function createToolRegistryMcpServer() {
  console.log('[ToolRegistry] Meta-tool for discovering and loading other tools')

  return createSdkMcpServer({
    name: 'tool-registry',
    version: '1.0.0',
    tools: [
      tool(
        'list_tools',
        'List all available tools with their descriptions, categories, and requirements. Use this to discover what tools are available.',
        {
          category: z.enum(['all', 'base', 'service']).optional().describe('Filter by category. Default: all'),
          search: z.string().optional().describe('Search query to filter tools by name or keywords')
        },
        async ({ category, search }) => {
          let tools = Object.entries(toolMetadata).map(([id, meta]) => ({
            id,
            ...meta
          }))

          if (category && category !== 'all') {
            tools = tools.filter(t => t.category === category)
          }

          if (search) {
            const q = search.toLowerCase()
            tools = tools.filter(t =>
              t.name.toLowerCase().includes(q) ||
              t.description.toLowerCase().includes(q) ||
              t.keywords.some(k => k.includes(q))
            )
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                count: tools.length,
                tools: tools.map(t => ({
                  id: t.id,
                  name: t.name,
                  category: t.category,
                  description: t.description,
                  keywords: t.keywords
                }))
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'search_tools',
        'Search for tools by keyword or description. Returns matching tools with details.',
        {
          query: z.string().describe('Search query - matches against tool names, descriptions, and keywords')
        },
        async ({ query }) => {
          const q = query.toLowerCase()
          const results = Object.entries(toolMetadata)
            .filter(([id, meta]) =>
              id.includes(q) ||
              meta.name.toLowerCase().includes(q) ||
              meta.description.toLowerCase().includes(q) ||
              meta.keywords.some(k => k.includes(q))
            )
            .map(([id, meta]) => ({
              id,
              ...meta
            }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                count: results.length,
                tools: results
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_tool_info',
        'Get detailed information about a specific tool, including its available actions/functions.',
        {
          tool_id: z.string().describe('The tool ID (e.g., "github", "voice", "system")')
        },
        async ({ tool_id }) => {
          const meta = toolMetadata[tool_id]
          if (!meta) {
            throw new Error(`Unknown tool: ${tool_id}. Use list_tools to see available tools.`)
          }

          // Get the actual server to list its tools
          try {
            const server = await getToolServer(tool_id)
            const toolList = server?.tools ? Object.keys(server.tools) : []

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  ...meta,
                  available_actions: toolList,
                  usage: `Use the appropriate tool function directly. The ${meta.name} tools are available when you load this tool.`
                }, null, 2)
              }]
            }
          } catch (err) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  ...meta,
                  error: `Could not load tool details: ${err.message}`,
                  hint: 'The tool may require API keys to be configured.'
                }, null, 2)
              }]
            }
          }
        }
      ),

      tool(
        'load_tool',
        'Load and return the MCP server for a specific tool. Use this to dynamically load tools on demand instead of having all tools in context.',
        {
          tool_id: z.string().describe('The tool ID to load (e.g., "github", "voice", "system")')
        },
        async ({ tool_id }) => {
          const meta = toolMetadata[tool_id]
          if (!meta) {
            throw new Error(`Unknown tool: ${tool_id}. Use list_tools to see available tools.`)
          }

          try {
            const server = await getToolServer(tool_id)
            if (!server) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    tool_id,
                    status: 'unavailable',
                    message: `${meta.name} is not available. Check that required API keys are set.`
                  }, null, 2)
                }]
              }
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  tool_id,
                  name: meta.name,
                  status: 'loaded',
                  message: `${meta.name} tools are now available. You can use them directly.`,
                  category: meta.category
                }, null, 2)
              }]
            }
          } catch (err) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  tool_id,
                  status: 'error',
                  error: err.message
                }, null, 2)
              }]
            }
          }
        }
      )
    ]
  })
}
