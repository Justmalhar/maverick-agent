import { getProvider, getAvailableProviders } from '../providers/index.js'
import fs from 'fs'
import path from 'path'

/**
 * Slash command handler for Maverick
 * Processes commands like /new, /reset, /status, /memory, /model, /provider
 */
export default class CommandHandler {
  constructor(gateway) {
    this.gateway = gateway
    this.pendingModelSelect = new Map() // chatId -> resolve
    this.pendingProviderSelect = new Map() // chatId -> resolve
  }

  /**
   * Check if message is a command
   */
  isCommand(text) {
    return text.trim().startsWith('/')
  }

  /**
   * Parse command and arguments
   */
  parse(text) {
    const trimmed = text.trim()
    const spaceIndex = trimmed.indexOf(' ')
    if (spaceIndex === -1) {
      return { command: trimmed.slice(1).toLowerCase(), args: '' }
    }
    return {
      command: trimmed.slice(1, spaceIndex).toLowerCase(),
      args: trimmed.slice(spaceIndex + 1).trim()
    }
  }

  /**
   * Execute a command
   * @returns {Object} { handled: boolean, response?: string }
   */
  async execute(text, sessionKey, adapter, chatId) {
    if (!this.isCommand(text)) {
      return { handled: false }
    }

    const { command, args } = this.parse(text)

    switch (command) {
      case 'new':
      case 'reset':
        return this.handleReset(sessionKey, adapter, chatId)

      case 'status':
        return this.handleStatus(sessionKey)

      case 'memory':
        return this.handleMemory(args)

      case 'queue':
        return this.handleQueue()

      case 'help':
        return this.handleHelp()

      case 'stop':
        return this.handleStop(sessionKey)

      case 'model':
        return this.handleModel(args, chatId, adapter)

      case 'provider':
        return this.handleProvider(args, chatId, adapter)

      case 'context':
        return this.handleContext(sessionKey)

      case 'history':
        return this.handleHistory(sessionKey, args)

      case 'tools':
        return this.handleTools(args)

      case 'load':
        return this.handleLoad(args)

      case 'services':
        return this.handleServices()

      case 'uptime':
        return this.handleUptime()

      case 'ping':
        return this.handlePing()

      case 'version':
        return this.handleVersion()

      case 'schedule':
        return this.handleSchedule()

      case 'voice':
        return this.handleVoice(args)

      case 'stt':
        return this.handleStt(args)

      case 'skills':
        return this.handleSkills()

      case 'media':
        return this.handleMedia(args)

      case 'read':
        return this.handleRead(args)

      case 'export':
        return this.handleExport(sessionKey, args)

      default:
        // Unknown command, pass to agent
        return { handled: false }
    }
  }

  /**
   * Check if a message is a reply to a pending /model or /provider selection
   */
  handlePendingReply(text, chatId) {
    if (this.pendingModelSelect.has(chatId)) {
      const resolve = this.pendingModelSelect.get(chatId)
      this.pendingModelSelect.delete(chatId)
      resolve(text.trim())
      return true
    }
    if (this.pendingProviderSelect.has(chatId)) {
      const resolve = this.pendingProviderSelect.get(chatId)
      this.pendingProviderSelect.delete(chatId)
      resolve(text.trim())
      return true
    }
    return false
  }

  async handleReset(sessionKey, adapter, chatId) {
    // Clear the session
    const sessionManager = this.gateway.sessionManager
    const agentRunner = this.gateway.agentRunner

    // Delete session from agent
    if (agentRunner.agent.sessions.has(sessionKey)) {
      agentRunner.agent.sessions.delete(sessionKey)
    }

    // Clear transcript
    if (sessionManager.sessions.has(sessionKey)) {
      sessionManager.sessions.delete(sessionKey)
    }

    return {
      handled: true,
      response: '🔄 Session reset. Starting fresh!'
    }
  }

  handleStatus(sessionKey) {
    const sessionManager = this.gateway.sessionManager
    const agentRunner = this.gateway.agentRunner

    const session = sessionManager.sessions.get(sessionKey)
    const agentSession = agentRunner.agent.sessions.get(sessionKey)
    const queueStatus = agentRunner.getQueueStatus(sessionKey)
    const globalStats = agentRunner.getGlobalStats()

    const lines = [
      '📊 *Status*',
      '',
      `*Session:* ${sessionKey.split(':').slice(-2).join(':')}`,
      `*Messages:* ${agentSession?.messageCount || 0}`,
      `*Queue:* ${queueStatus.pending} pending${queueStatus.processing ? ' (processing)' : ''}`,
      '',
      `*Global:* ${globalStats.totalProcessed} processed, ${globalStats.totalFailed} failed`
    ]

    return {
      handled: true,
      response: lines.join('\n')
    }
  }

  handleMemory(args) {
    const memoryManager = this.gateway.agentRunner.agent.memoryManager

    if (args === 'list') {
      const files = memoryManager.listDailyFiles()
      const lines = [
        '📝 *Memory Files*',
        '',
        `*MEMORY.md:* ${memoryManager.readLongTermMemory() ? 'exists' : 'empty'}`,
        '',
        '*Daily logs:*',
        ...files.slice(0, 10).map(f => `  • ${f}`)
      ]
      if (files.length > 10) {
        lines.push(`  ... and ${files.length - 10} more`)
      }
      return { handled: true, response: lines.join('\n') }
    }

    if (args.startsWith('search ')) {
      const query = args.slice(7)
      const results = memoryManager.searchMemory(query)
      if (results.length === 0) {
        return { handled: true, response: `🔍 No results for "${query}"` }
      }
      const lines = [
        `🔍 *Search: "${query}"*`,
        ''
      ]
      for (const result of results.slice(0, 5)) {
        lines.push(`*${result.file}:*`)
        for (const match of result.matches.slice(0, 2)) {
          lines.push(`  Line ${match.line}: ${match.context.substring(0, 100)}...`)
        }
      }
      return { handled: true, response: lines.join('\n') }
    }

    // Show today's memory
    const today = memoryManager.readTodayMemory()
    const longTerm = memoryManager.readLongTermMemory()

    const lines = [
      '🧠 *Memory*',
      '',
      '*Long-term (MEMORY.md):*',
      longTerm ? longTerm.substring(0, 500) + (longTerm.length > 500 ? '...' : '') : 'Empty',
      '',
      '*Today:*',
      today ? today.substring(0, 500) + (today.length > 500 ? '...' : '') : 'No notes yet'
    ]

    return {
      handled: true,
      response: lines.join('\n')
    }
  }

  handleQueue() {
    const stats = this.gateway.agentRunner.getGlobalStats()

    const lines = [
      '📋 *Queue Status*',
      '',
      `*Pending:* ${stats.totalPending}`,
      `*Active sessions:* ${stats.activeSessions}`,
      `*Total sessions:* ${stats.totalSessions}`,
      '',
      `*Processed:* ${stats.totalProcessed}`,
      `*Failed:* ${stats.totalFailed}`
    ]

    return {
      handled: true,
      response: lines.join('\n')
    }
  }

  handleStop(sessionKey) {
    const aborted = this.gateway.agentRunner.abort(sessionKey)
    return {
      handled: true,
      response: aborted ? '⏹️ Stopped current operation' : '⏹️ Nothing to stop'
    }
  }

  async handleModel(args, chatId, adapter) {
    const agent = this.gateway.agentRunner.agent
    const provider = agent.provider
    const models = provider.getAvailableModels()
    const current = provider.getModel()

    // If arg provided directly, e.g. /model 2
    if (args) {
      const idx = parseInt(args) - 1
      if (idx >= 0 && idx < models.length) {
        provider.setModel(models[idx].id)
        return { handled: true, response: `✅ Model set to: ${models[idx].label} (${models[idx].id})` }
      }
      // Try matching by name
      const match = models.find(m => m.id.includes(args.toLowerCase()) || m.label.toLowerCase().includes(args.toLowerCase()))
      if (match) {
        provider.setModel(match.id)
        return { handled: true, response: `✅ Model set to: ${match.label} (${match.id})` }
      }
      return { handled: true, response: `Unknown model. Use /model to see options.` }
    }

    // Show list and wait for reply
    const lines = [
      `🤖 *Models* (${agent.providerName})`,
      `Current: ${current || '(default)'}`,
      ''
    ]
    for (let i = 0; i < models.length; i++) {
      const marker = models[i].id === current ? ' ←' : ''
      lines.push(`${i + 1}) ${models[i].label}${marker}`)
    }
    lines.push('', 'Reply with a number to switch.')

    await adapter.sendMessage(chatId, lines.join('\n'))

    // Wait for reply with timeout
    const reply = await new Promise((resolve) => {
      this.pendingModelSelect.set(chatId, resolve)
      setTimeout(() => {
        if (this.pendingModelSelect.has(chatId)) {
          this.pendingModelSelect.delete(chatId)
          resolve(null)
        }
      }, 30000)
    })

    if (!reply) return { handled: true, response: '' }

    const idx = parseInt(reply) - 1
    if (idx >= 0 && idx < models.length) {
      provider.setModel(models[idx].id)
      return { handled: true, response: `✅ Model set to: ${models[idx].label}` }
    }
    return { handled: true, response: 'No change.' }
  }

  async handleProvider(args, chatId, adapter) {
    const agent = this.gateway.agentRunner.agent
    const available = getAvailableProviders()
    const current = agent.providerName

    // If arg provided directly, e.g. /provider opencode
    if (args) {
      const target = args.toLowerCase()
      if (!available.includes(target)) {
        return { handled: true, response: `Unknown provider. Available: ${available.join(', ')}` }
      }
      if (target === current) {
        return { handled: true, response: `Already using ${current}.` }
      }
      this.switchProvider(agent, target)
      return { handled: true, response: `✅ Switched to ${target}` }
    }

    // Show list and wait for reply
    const lines = [
      '🔌 *Providers*',
      `Current: ${current}`,
      ''
    ]
    for (let i = 0; i < available.length; i++) {
      const marker = available[i] === current ? ' ←' : ''
      lines.push(`${i + 1}) ${available[i]}${marker}`)
    }
    lines.push('', 'Reply with a number to switch.')

    await adapter.sendMessage(chatId, lines.join('\n'))

    const reply = await new Promise((resolve) => {
      this.pendingProviderSelect.set(chatId, resolve)
      setTimeout(() => {
        if (this.pendingProviderSelect.has(chatId)) {
          this.pendingProviderSelect.delete(chatId)
          resolve(null)
        }
      }, 30000)
    })

    if (!reply) return { handled: true, response: '' }

    const idx = parseInt(reply) - 1
    if (idx >= 0 && idx < available.length) {
      const target = available[idx]
      if (target === current) return { handled: true, response: `Already using ${current}.` }
      this.switchProvider(agent, target)
      return { handled: true, response: `✅ Switched to ${target}` }
    }
    return { handled: true, response: 'No change.' }
  }

  switchProvider(agent, providerName) {
    const config = agent.provider.config || {}
    const newProvider = getProvider(providerName, config)
    agent.provider = newProvider
    agent.providerName = providerName
    // Clear sessions since they belong to the old provider
    agent.sessions.clear()
  }

  handleContext(sessionKey) {
    const agentSession = this.gateway.agentRunner.agent.sessions.get(sessionKey)
    if (!agentSession) {
      return { handled: true, response: '📊 No active session' }
    }

    const messageCount = agentSession.messageCount || 0
    const hasSummary = !!agentSession.summary
    const historyLength = agentSession.messages?.length || 0

    const lines = [
      '📊 *Context*',
      '',
      `*Messages:* ${messageCount}`,
      `*History:* ${historyLength} stored`,
      `*Summary:* ${hasSummary ? 'Yes (compressed)' : 'No'}`,
      `*Session:* ${sessionKey.split(':').slice(-2).join(':')}`
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleHistory(sessionKey, args) {
    const agentSession = this.gateway.agentRunner.agent.sessions.get(sessionKey)
    if (!agentSession?.messages?.length) {
      return { handled: true, response: '📜 No history yet' }
    }

    const limit = parseInt(args) || 5
    const messages = agentSession.messages.slice(-limit)

    const lines = [`📜 *Last ${messages.length} messages:*`, '']
    for (const msg of messages) {
      const role = msg.role === 'user' ? '👤' : '🤖'
      const content = msg.content?.substring(0, 100) || '(empty)'
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''
      lines.push(`${role} ${time}: ${content}${msg.content?.length > 100 ? '...' : ''}`)
    }

    return { handled: true, response: lines.join('\n') }
  }

  handleTools(args) {
    const agent = this.gateway.agentRunner.agent

    if (args === 'loaded') {
      const loaded = Object.keys(agent.serviceMcpServers).filter(k => agent.serviceMcpServers[k])
      const lines = ['🔧 *Loaded Services:*', '', ...loaded.map(s => `• ${s}`)]
      if (loaded.length === 0) lines.push('None loaded')
      return { handled: true, response: lines.join('\n') }
    }

    const baseTools = [
      'cron', 'gateway', 'system', 'voice', 'applescript', 'tool-registry'
    ]
    const services = [
      'github', 'google-tasks', 'google-calendar', 'microsoft-todo',
      'microsoft-calendar', 'vercel', 'supabase', 'search', 'docker'
    ]

    const loaded = Object.keys(agent.serviceMcpServers).filter(k => agent.serviceMcpServers[k])

    const lines = [
      '🔧 *Tools*',
      '',
      '*Base (always loaded):*',
      ...baseTools.map(t => `• ${t}`),
      '',
      '*Services (use /load to activate):*',
      ...services.map(s => {
        const isLoaded = loaded.includes(s)
        return `• ${s}${isLoaded ? ' ✓' : ''}`
      })
    ]

    return { handled: true, response: lines.join('\n') }
  }

  async handleLoad(args) {
    if (!args) {
      return { handled: true, response: 'Usage: /load <tool>\nExample: /load github' }
    }

    const agent = this.gateway.agentRunner.agent
    const service = args.toLowerCase()

    if (agent.serviceMcpServers[service]) {
      return { handled: true, response: `✓ ${service} already loaded` }
    }

    if (!agent.serviceLoaders[service]) {
      return { handled: true, response: `Unknown service: ${service}\nUse /tools to see available services` }
    }

    try {
      await agent.loadService(service)
      return { handled: true, response: `✓ Loaded ${service}. Tools now available.` }
    } catch (err) {
      return { handled: true, response: `✗ Failed to load ${service}: ${err.message}` }
    }
  }

  handleServices() {
    const agent = this.gateway.agentRunner.agent
    const services = agent.getAvailableServices()

    const lines = [
      '🔌 *Services*',
      '',
      ...services.map(s =>
        `• ${s.name}: ${s.loaded ? '✓ loaded' : '○ not loaded'} (${s.tools.length} tools)`
      )
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleUptime() {
    const uptime = process.uptime()
    const hours = Math.floor(uptime / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const seconds = Math.floor(uptime % 60)

    const memUsage = process.memoryUsage()
    const memMB = Math.round(memUsage.heapUsed / 1024 / 1024)

    const lines = [
      '⏱️ *Uptime*',
      '',
      `*Running:* ${hours}h ${minutes}m ${seconds}s`,
      `*Memory:* ${memMB}MB heap`,
      `*PID:* ${process.pid}`,
      `*Node:* ${process.version}`
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handlePing() {
    return {
      handled: true,
      response: `🏓 Pong!\n⏱️ ${new Date().toISOString()}`
    }
  }

  handleVersion() {
    const config = this.gateway.agentRunner.agent
    const lines = [
      '📦 *Maverick Agent*',
      '',
      `*Provider:* ${config.providerName}`,
      `*Model:* ${config.provider.getModel() || 'default'}`,
      `*Version:* 1.0.0`,
      `*Node:* ${process.version}`,
      `*Platform:* ${process.platform}`
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleSchedule() {
    const scheduler = this.gateway.agentRunner.agent.cronScheduler
    const jobs = scheduler.listJobs ? scheduler.listJobs() : []

    if (jobs.length === 0) {
      return { handled: true, response: '📅 No scheduled jobs' }
    }

    const lines = [
      '📅 *Scheduled Jobs*',
      '',
      ...jobs.map(j => `• ${j.id}: ${j.schedule || j.type}`)
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleVoice(args) {
    const providers = ['elevenlabs', 'openai', 'kokoro', 'deepgram', 'fal', 'replicate']

    if (args && providers.includes(args.toLowerCase())) {
      process.env.TTS_PROVIDER = args.toLowerCase()
      return { handled: true, response: `🎤 TTS provider set to: ${args}` }
    }

    const current = process.env.TTS_PROVIDER || 'elevenlabs'
    const lines = [
      '🎤 *Voice TTS*',
      `*Current:* ${current}`,
      '',
      'Available:',
      ...providers.map(p => `• ${p}${p === current ? ' ←' : ''}`),
      '',
      'Usage: /voice <provider>'
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleStt(args) {
    const providers = ['groq', 'openai', 'deepgram', 'kokoro', 'fal', 'replicate']

    if (args && providers.includes(args.toLowerCase())) {
      process.env.STT_PROVIDER = args.toLowerCase()
      return { handled: true, response: `🎤 STT provider set to: ${args}` }
    }

    const current = process.env.STT_PROVIDER || 'groq'
    const lines = [
      '🎤 *Voice STT*',
      `*Current:* ${current}`,
      '',
      'Available:',
      ...providers.map(p => `• ${p}${p === current ? ' ←' : ''}`),
      '',
      'Usage: /stt <provider>'
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleMedia(args) {
    const imageModels = [
      { id: 'flux-2', name: 'FLUX.2 Dev', cost: '$0.012/MP' },
      { id: 'flux-schnell', name: 'FLUX Schnell', cost: '$0.003/MP' },
      { id: 'flux-dev', name: 'FLUX Dev', cost: '$0.025/MP' },
      { id: 'gpt-image-2', name: 'GPT Image 2', cost: 'Variable' },
      { id: 'nano-banana-2', name: 'Nano Banana 2', cost: '$0.08/img' },
      { id: 'nano-banana-2-edit', name: 'Nano Banana 2 Edit', cost: '$0.08/img' },
      { id: 'nano-banana-pro', name: 'Nano Banana Pro', cost: '$0.15/img' },
      { id: 'grok-imagine', name: 'Grok Imagine', cost: '$0.02/img' },
      { id: 'grok-imagine-edit', name: 'Grok Imagine Edit', cost: '$0.022/img' },
      { id: 'ideogram-v3', name: 'Ideogram V3', cost: '$0.03-$0.09' },
      { id: 'recraft-v3', name: 'Recraft V3', cost: '$0.04/img' }
    ]

    const videoModels = [
      { id: 'seedance-i2v', name: 'Seedance 2.0 I2V', cost: '$0.30/sec' },
      { id: 'seedance-i2v-fast', name: 'Seedance 2.0 Fast I2V', cost: '$0.24/sec' },
      { id: 'seedance-t2v', name: 'Seedance 2.0 T2V', cost: '$0.30/sec' },
      { id: 'seedance-t2v-fast', name: 'Seedance 2.0 Fast T2V', cost: '$0.24/sec' },
      { id: 'grok-imagine-t2v', name: 'Grok Imagine T2V', cost: '$0.05-$0.07/sec' },
      { id: 'grok-imagine-i2v', name: 'Grok Imagine I2V', cost: '$0.05-$0.07/sec' },
      { id: 'grok-imagine-r2v', name: 'Grok Imagine R2V', cost: 'Variable' }
    ]

    const lines = [
      '🎨 *Media Generation*',
      '',
      '*Image Models (safety filter off by default):*',
      ...imageModels.map(m => `• ${m.id}: ${m.name} (${m.cost})`),
      '',
      '*Video Models:*',
      ...videoModels.map(m => `• ${m.id}: ${m.name} (${m.cost})`),
      '',
      '*Upscaling:*',
      '• image: Topaz Image Upscale',
      '• video: Topaz Video Upscale',
      '',
      'Use tool-registry to load: /load media'
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleSkills() {
    const skillsDir = path.join(process.env.HOME, '.maverick', 'Skills')

    if (!fs.existsSync(skillsDir)) {
      return { handled: true, response: '📁 No skills installed' }
    }

    const skills = fs.readdirSync(skillsDir).filter(f => {
      const skillPath = path.join(skillsDir, f)
      return fs.statSync(skillPath).isDirectory()
    })

    const lines = [
      '🎯 *Skills*',
      '',
      ...skills.map(s => `• ${s}`),
      '',
      `*Total:* ${skills.length} skills`
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleRead(args) {
    if (!args) {
      return { handled: true, response: 'Usage: /read <filename>\nExample: /read SOUL.md' }
    }

    const workspace = process.env.MAVERICK_AGENT_WORKSPACE || path.join(process.env.HOME, 'maverick-agent')
    const filePath = path.join(workspace, args)

    if (!fs.existsSync(filePath)) {
      return { handled: true, response: `✗ File not found: ${args}` }
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const preview = content.substring(0, 1000)
    const truncated = content.length > 1000

    const lines = [
      `📄 *${args}*`,
      '',
      preview,
      truncated ? `\n... (${content.length} chars total)` : ''
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleExport(sessionKey, args) {
    const agentSession = this.gateway.agentRunner.agent.sessions.get(sessionKey)
    if (!agentSession?.messages?.length) {
      return { handled: true, response: '📜 No messages to export' }
    }

    const workspace = process.env.MAVERICK_AGENT_WORKSPACE || path.join(process.env.HOME, 'maverick-agent')
    const exportDir = path.join(workspace, 'Chats')

    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = args || `chat-${timestamp}.md`
    const filePath = path.join(exportDir, filename)

    const lines = [
      `# Chat Export - ${new Date().toLocaleString()}`,
      `Session: ${sessionKey}`,
      '',
      '---',
      ''
    ]

    for (const msg of agentSession.messages) {
      const role = msg.role === 'user' ? 'User' : 'Maverick'
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''
      lines.push(`### ${role} (${time})`)
      lines.push(msg.content || '')
      lines.push('')
    }

    fs.writeFileSync(filePath, lines.join('\n'))

    return {
      handled: true,
      response: `📤 Exported ${agentSession.messages.length} messages to:\n${filename}`
    }
  }

  handleHelp() {
    const lines = [
      '📖 *Commands*',
      '',
      '*Session:*',
      '`/new` or `/reset` - Start fresh session',
      '`/status` - Show session status',
      '`/context` - Show context token count',
      '`/history [n]` - Show last N messages (default 5)',
      '`/stop` - Stop current operation',
      '',
      '*Memory:*',
      '`/memory` - Show memory summary',
      '`/memory list` - List memory files',
      '`/memory search <query>` - Search memories',
      '',
      '*Tools & Services:*',
      '`/tools` - List available tools',
      '`/tools loaded` - Show loaded services',
      '`/load <tool>` - Load a service (e.g., /load github)',
      '`/media` - Show media generation models',
      '`/services` - Show service status',
      '',
      '*Voice:*',
      '`/voice [provider]` - Switch/view TTS provider',
      '`/stt [provider]` - Switch/view STT provider',
      '',
      '*System:*',
      '`/queue` - Show queue status',
      '`/uptime` - Agent uptime',
      '`/ping` - Health check',
      '`/version` - Version info',
      '`/schedule` - List scheduled jobs',
      '',
      '*Model:*',
      '`/model` - Switch AI model',
      '`/provider` - Switch provider',
      '',
      '*Workspace:*',
      '`/skills` - List installed skills',
      '`/read <file>` - Read workspace file',
      '`/export [filename]` - Export conversation',
      '',
      '*Other:*',
      '`/help` - Show this help'
    ]

    return {
      handled: true,
      response: lines.join('\n')
    }
  }
}
