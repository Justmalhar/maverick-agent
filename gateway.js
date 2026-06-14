import 'dotenv/config'
import http from 'http'
import { WebSocketServer } from 'ws'
import QRCode from 'qrcode'
import config from './config.js'
import WhatsAppAdapter from './adapters/whatsapp.js'
import iMessageAdapter from './adapters/imessage.js'
import TelegramAdapter from './adapters/telegram.js'
import SessionManager from './sessions/manager.js'
import AgentRunner from './agent/runner.js'
import CommandHandler from './commands/handler.js'
import { transcribeAudio, isTranscriptionAvailable } from './tools/transcription.js'

/**
 * Maverick Agent Gateway - Routes messages between messaging platforms and Claude agent
 */
class Gateway {
  constructor() {
    this.sessionManager = new SessionManager()
    this.agentRunner = new AgentRunner(this.sessionManager, {
      allowedTools: config.agent?.allowedTools || ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      maxTurns: config.agent?.maxTurns || 50,
      provider: config.agent?.provider || 'claude',
      permissionMode: 'bypassPermissions',
      opencode: config.agent?.opencode || {},
      providers: config.providers || {}
    })
    this.commandHandler = new CommandHandler(this)
    this.adapters = new Map()
    this.pendingApprovals = new Map() // chatId -> { resolve, timeout }
    this.mcpServers = {}
    this.wsClients = new Map() // sessionId -> Set<ws>
    this.setupQueueMonitoring()
    this.setupAgentMonitoring()
    this.setupCronExecution()
  }

  setupQueueMonitoring() {
    this.agentRunner.on('queued', ({ runId, sessionKey, position, queueLength }) => {
      if (position > 0) {
        console.log(`[Queue] 📥 Queued: position ${position + 1}, ${queueLength} pending`)
      }
    })

    this.agentRunner.on('processing', ({ runId, waitTimeMs, remainingInQueue }) => {
      if (waitTimeMs > 100) {
        console.log(`[Queue] ⚙️  Processing (waited ${Math.round(waitTimeMs)}ms, ${remainingInQueue} remaining)`)
      }
    })

    this.agentRunner.on('completed', ({ runId, processingTimeMs }) => {
      console.log(`[Queue] ✓ Completed in ${Math.round(processingTimeMs)}ms`)
    })

    this.agentRunner.on('failed', ({ runId, error }) => {
      console.log(`[Queue] ✗ Failed: ${error}`)
    })
  }

  setupAgentMonitoring() {
    this.agentRunner.on('agent:tool', ({ sessionKey, name }) => {
      console.log(`[Agent] 🔧 Using tool: ${name}`)
    })
  }

  setupCronExecution() {
    this.agentRunner.agent.cronScheduler.on('execute', async ({ jobId, platform, chatId, sessionKey, message, invokeAgent }) => {
      console.log(`[Cron] ⏰ Executing job ${jobId}${invokeAgent ? ' (invoking agent)' : ''}`)

      const adapter = this.adapters.get(platform)
      if (!adapter) {
        console.error(`[Cron] No adapter for platform: ${platform}`)
        return
      }

      try {
        if (invokeAgent) {
          console.log(`[Cron] Invoking agent with: ${message}`)
          const response = await this.agentRunner.agent.runAndCollect({
            message,
            sessionKey: sessionKey || `cron:${jobId}`,
            platform,
            chatId,
            mcpServers: this.mcpServers
          })

          if (response) {
            await adapter.sendMessage(chatId, response)
            console.log(`[Cron] Agent response sent for job ${jobId}`)
          }
        } else {
          await adapter.sendMessage(chatId, message)
          console.log(`[Cron] Message sent for job ${jobId}`)
        }
      } catch (err) {
        console.error(`[Cron] Failed to execute job:`, err.message)
      }
    })
  }

  waitForApproval(chatId, adapter, message, timeoutMs = 120000) {
    const existing = this.pendingApprovals.get(chatId)
    if (existing) {
      clearTimeout(existing.timeout)
      existing.resolve(null)
    }

    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(chatId)
        resolve(null)
      }, timeoutMs)

      this.pendingApprovals.set(chatId, { resolve, timeout })

      try {
        await adapter.sendMessage(chatId, message)
      } catch (err) {
        console.error('[Gateway] Failed to send approval prompt:', err.message)
        clearTimeout(timeout)
        this.pendingApprovals.delete(chatId)
        resolve(null)
      }
    })
  }

  async start() {
    console.log('='.repeat(50))
    console.log('Maverick Agent Gateway Starting')
    console.log('='.repeat(50))
    console.log(`Agent ID: ${config.agentId}`)
    console.log(`Workspace: ~/maverick-agent/`)
    console.log('')

    const platforms = ['whatsapp', 'imessage', 'telegram']
    for (const p of platforms) {
      const pc = config[p]
      if (!pc?.enabled) continue
      const dms = pc.allowedDMs?.length ? pc.allowedDMs.join(', ') : 'NONE (all blocked)'
      const groups = pc.allowedGroups?.length ? pc.allowedGroups.join(', ') : 'NONE (all blocked)'
      console.log(`[Security] ${p}: DMs=${dms} | Groups=${groups}`)
    }

    this.agentRunner.setMcpServers(this.mcpServers)

    if (this.agentRunner.agent.provider.initialize) {
      try {
        await this.agentRunner.agent.provider.initialize()
        console.log('[Provider] Ready')
      } catch (err) {
        console.error('[Provider] Init failed:', err.message)
      }
    }

    this.agentRunner.agent.gateway = this

    if (config.whatsapp.enabled) {
      console.log('[Gateway] Initializing WhatsApp adapter...')
      const whatsapp = new WhatsAppAdapter(config.whatsapp)
      this.setupAdapter(whatsapp, 'whatsapp', config.whatsapp)
      this.adapters.set('whatsapp', whatsapp)

      try {
        await whatsapp.start()
      } catch (err) {
        console.error('[Gateway] WhatsApp adapter failed to start:', err.message)
      }
    }

    if (config.imessage.enabled) {
      console.log('[Gateway] Initializing iMessage adapter...')
      const imessage = new iMessageAdapter(config.imessage)
      this.setupAdapter(imessage, 'imessage', config.imessage)
      this.adapters.set('imessage', imessage)

      try {
        await imessage.start()
      } catch (err) {
        console.error('[Gateway] iMessage adapter failed to start:', err.message)
      }
    }

    if (config.telegram?.enabled) {
      console.log('[Gateway] Initializing Telegram adapter...')
      const telegram = new TelegramAdapter(config.telegram)
      this.setupAdapter(telegram, 'telegram', config.telegram)
      this.adapters.set('telegram', telegram)

      try {
        await telegram.start()
      } catch (err) {
        console.error('[Gateway] Telegram adapter failed to start:', err.message)
      }
    }

    process.on('SIGINT', () => this.stop())
    process.on('SIGTERM', () => this.stop())

    this.startHttpServer()

    console.log('')
    console.log('[Gateway] Ready and listening for messages')
    console.log('[Gateway] Commands: /help, /new, /status, /memory, /stop')
  }

  setupAdapter(adapter, platform, platformConfig) {
    adapter.onMessage(async (message) => {
      const sessionKey = adapter.generateSessionKey(config.agentId, platform, message)

      console.log('')
      console.log(`[${platform.toUpperCase()}] Incoming message:`)
      console.log(`  Session: ${sessionKey}`)
      console.log(`  From: ${message.sender}`)
      console.log(`  Group: ${message.isGroup}`)
      console.log(`  Text: ${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}`)
      if (message.image) {
        console.log(`  Image: ${Math.round(message.image.data.length / 1024)}KB`)
      }

      // Auto-transcribe voice messages
      if (message.audio?.isVoice && message.audio?.data && isTranscriptionAvailable()) {
        try {
          console.log(`[${platform.toUpperCase()}] Transcribing voice message...`)
          const audioBuffer = Buffer.from(message.audio.data, 'base64')
          const transcription = await transcribeAudio(audioBuffer, {
            mimeType: message.audio.mediaType
          })
          if (transcription.text) {
            // Prepend transcription to the message text
            message.text = transcription.text
            message.transcription = transcription
            console.log(`[${platform.toUpperCase()}] Transcribed: ${transcription.text.substring(0, 100)}${transcription.text.length > 100 ? '...' : ''}`)
          }
        } catch (err) {
          console.error(`[${platform.toUpperCase()}] Transcription failed:`, err.message)
          // Continue with original text (likely empty or "[Audio]")
        }
      }

      const pending = this.pendingApprovals.get(message.chatId)
      if (pending) {
        console.log(`[${platform.toUpperCase()}] Resolving pending approval with: ${message.text}`)
        clearTimeout(pending.timeout)
        this.pendingApprovals.delete(message.chatId)
        pending.resolve(message.text)
        return
      }

      if (this.commandHandler.handlePendingReply(message.text, message.chatId)) {
        console.log(`[${platform.toUpperCase()}] Resolved pending command selection: ${message.text}`)
        return
      }

      try {
        const commandResult = await this.commandHandler.execute(
          message.text,
          sessionKey,
          adapter,
          message.chatId
        )

        if (commandResult.handled) {
          console.log(`[${platform.toUpperCase()}] Command handled: ${message.text.split(' ')[0]}`)
          if (commandResult.response) {
            await adapter.sendMessage(message.chatId, commandResult.response)
          }
          return
        }

        const queueStatus = this.agentRunner.getQueueStatus(sessionKey)

        if (adapter.sendTyping) {
          await adapter.sendTyping(message.chatId)
        }

        if (queueStatus.pending > 0 && adapter.react && message.raw?.key?.id) {
          await adapter.react(message.chatId, message.raw.key.id, '⏳')
        }

        console.log(`[${platform.toUpperCase()}] Processing...`)
        const response = await this.agentRunner.enqueueRun(
          sessionKey,
          message.text,
          adapter,
          message.chatId,
          message.image
        )

        if (adapter.stopTyping) {
          await adapter.stopTyping(message.chatId)
        }

        console.log(`[${platform.toUpperCase()}] Done`)
      } catch (error) {
        console.error(`[${platform.toUpperCase()}] Error:`, error.message)

        if (adapter.stopTyping) {
          await adapter.stopTyping(message.chatId)
        }

        try {
          await adapter.sendMessage(
            message.chatId,
            "Sorry, I encountered an error. Please try again."
          )
        } catch (sendErr) {
          console.error(`[${platform.toUpperCase()}] Failed to send error message:`, sendErr.message)
        }
      }
    })
  }

  startHttpServer() {
    const port = process.env.PORT || 4096

    this.httpServer = http.createServer(async (req, res) => {
      if (req.url === '/qr') {
        const wa = this.adapters.get('whatsapp')
        if (!wa || !wa.latestQr) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          const status = wa?.myJid ? 'WhatsApp is connected.' : 'No QR code available. Waiting for WhatsApp...'
          res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>WhatsApp QR</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff}</style></head><body><p>${status}</p></body></html>`)
          return
        }

        try {
          const qrDataUrl = await QRCode.toDataURL(wa.latestQr, { width: 400, margin: 2 })
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10"><title>WhatsApp QR</title><style>body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff}img{border-radius:12px}</style></head><body><h2>Scan with WhatsApp</h2><img src="${qrDataUrl}" alt="QR Code"/><p>Page refreshes automatically.</p></body></html>`)
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Failed to generate QR')
        }
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      const adaptersStatus = {}
      for (const [name, adapter] of this.adapters) {
        adaptersStatus[name] = { connected: !!adapter.sock || !!adapter.bot }
      }
      res.end(JSON.stringify({ status: 'ok', adapters: adaptersStatus }))
    })

    this.httpServer.listen(port, () => {
      console.log(`[HTTP] Listening on port ${port} (QR code at /qr)`)
    })

    // WebSocket server for web client
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' })

    this.wss.on('connection', (ws, req) => {
      console.log('[WS] Client connected')

      // Session ID from query string
      const url = new URL(req.url, `http://localhost:${port}`)
      const sessionId = url.searchParams.get('session') || `web:${Date.now()}`

      // Track client
      if (!this.wsClients.has(sessionId)) {
        this.wsClients.set(sessionId, new Set())
      }
      this.wsClients.get(sessionId).add(ws)

      // Send connection confirmation
      ws.send(JSON.stringify({ type: 'connected', sessionId }))

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString())

          if (msg.type === 'chat') {
            await this.handleWebSocketChat(ws, sessionId, msg)
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
          }
        } catch (err) {
          console.error('[WS] Error:', err.message)
          ws.send(JSON.stringify({ type: 'error', error: err.message }))
        }
      })

      ws.on('close', () => {
        console.log('[WS] Client disconnected')
        const clients = this.wsClients.get(sessionId)
        if (clients) {
          clients.delete(ws)
          if (clients.size === 0) {
            this.wsClients.delete(sessionId)
          }
        }
      })

      ws.on('error', (err) => {
        console.error('[WS] Error:', err.message)
      })
    })

    console.log('[WS] WebSocket server ready at /ws')
  }

  /**
   * Handle chat message from WebSocket client
   */
  async handleWebSocketChat(ws, sessionId, msg) {
    const { message, image } = msg

    console.log(`[WS] Message from ${sessionId}: ${message.substring(0, 100)}...`)

    // Send typing indicator
    ws.send(JSON.stringify({ type: 'typing' }))

    try {
      let fullText = ''

      for await (const chunk of this.agentRunner.agent.run({
        message,
        sessionKey: `web:${sessionId}`,
        platform: 'web',
        chatId: sessionId,
        image: image ? { data: image.data, mediaType: image.mediaType } : null,
        mcpServers: this.mcpServers
      })) {
        // Stream text chunks
        if (chunk.type === 'text') {
          fullText += chunk.content
          ws.send(JSON.stringify({ type: 'text', content: chunk.content }))
        }

        // Tool use notification
        if (chunk.type === 'tool_use') {
          ws.send(JSON.stringify({
            type: 'tool_use',
            name: chunk.name,
            input: chunk.input
          }))
        }

        // Tool result notification
        if (chunk.type === 'tool_result') {
          ws.send(JSON.stringify({
            type: 'tool_result',
            result: typeof chunk.result === 'string'
              ? chunk.result.substring(0, 500)
              : 'result received'
          }))
        }

        // Done
        if (chunk.type === 'done') {
          ws.send(JSON.stringify({
            type: 'done',
            fullText: chunk.fullText || fullText
          }))
        }

        // Error
        if (chunk.type === 'error') {
          ws.send(JSON.stringify({
            type: 'error',
            error: chunk.error
          }))
        }

        // Aborted
        if (chunk.type === 'aborted') {
          ws.send(JSON.stringify({ type: 'aborted' }))
        }
      }
    } catch (err) {
      console.error('[WS] Chat error:', err.message)
      ws.send(JSON.stringify({ type: 'error', error: err.message }))
    }
  }

  /**
   * Broadcast message to all WebSocket clients in a session
   */
  broadcastToSession(sessionId, message) {
    const clients = this.wsClients.get(sessionId)
    if (clients) {
      const data = JSON.stringify(message)
      for (const ws of clients) {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(data)
        }
      }
    }
  }

  async stop() {
    console.log('\n[Gateway] Shutting down...')

    this.agentRunner.agent.stopCron()

    for (const adapter of this.adapters.values()) {
      try {
        await adapter.stop()
      } catch (err) {
        console.error('[Gateway] Error stopping adapter:', err.message)
      }
    }

    console.log('[Gateway] Goodbye!')
    process.exit(0)
  }
}

const gateway = new Gateway()
gateway.start().catch((err) => {
  console.error('[Gateway] Fatal error:', err)
  process.exit(1)
})
