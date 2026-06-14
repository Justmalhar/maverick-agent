import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import fs from 'fs'

/**
 * Gateway context - set by gateway before agent runs
 */
let gatewayContext = {
  gateway: null,
  currentPlatform: null,
  currentChatId: null,
  currentSessionKey: null
}

export function setGatewayContext(ctx) {
  gatewayContext = { ...gatewayContext, ...ctx }
}

export function getGatewayContext() {
  return gatewayContext
}

/**
 * Create Gateway MCP server with tools for interacting with the gateway
 */
export function createGatewayMcpServer() {
  return createSdkMcpServer({
    name: 'gateway',
    version: '1.0.0',
    tools: [
      tool(
        'send_message',
        'Send a message to a specific chat on any connected platform. Use this to proactively message users or send to different chats.',
        {
          platform: z.enum(['whatsapp', 'imessage', 'telegram']).describe('The messaging platform'),
          chat_id: z.string().describe('The chat ID to send to (e.g., phone@s.whatsapp.net for WhatsApp)'),
          message: z.string().describe('The message text to send')
        },
        async ({ platform, chat_id, message }) => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          const adapter = gateway.adapters.get(platform)
          if (!adapter) {
            return { success: false, error: `Platform ${platform} not connected` }
          }

          try {
            await adapter.sendMessage(chat_id, message)
            return { success: true, platform, chat_id, message_length: message.length }
          } catch (err) {
            return { success: false, error: err.message }
          }
        }
      ),

      tool(
        'send_image',
        'Send an image to a specific chat. Provide a file path or base64 encoded image.',
        {
          platform: z.enum(['whatsapp', 'imessage', 'telegram']).describe('The messaging platform'),
          chat_id: z.string().describe('The chat ID to send to'),
          file_path: z.string().optional().describe('Path to the image file'),
          image_base64: z.string().optional().describe('Base64 encoded image data'),
          caption: z.string().optional().describe('Caption for the image')
        },
        async ({ platform, chat_id, file_path, image_base64, caption }) => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          const adapter = gateway.adapters.get(platform)
          if (!adapter) {
            return { success: false, error: `Platform ${platform} not connected` }
          }

          try {
            let media
            if (file_path) {
              if (!fs.existsSync(file_path)) {
                return { success: false, error: `File not found: ${file_path}` }
              }
              media = file_path
            } else if (image_base64) {
              media = Buffer.from(image_base64, 'base64')
            } else {
              return { success: false, error: 'Either file_path or image_base64 is required' }
            }

            await adapter.sendImage(chat_id, media, { caption })
            return { success: true, platform, chat_id }
          } catch (err) {
            return { success: false, error: err.message }
          }
        }
      ),

      tool(
        'send_video',
        'Send a video to a specific chat. Provide a file path or base64 encoded video.',
        {
          platform: z.enum(['whatsapp', 'imessage', 'telegram']).describe('The messaging platform'),
          chat_id: z.string().describe('The chat ID to send to'),
          file_path: z.string().optional().describe('Path to the video file'),
          video_base64: z.string().optional().describe('Base64 encoded video data'),
          caption: z.string().optional().describe('Caption for the video'),
          duration: z.number().optional().describe('Duration in seconds')
        },
        async ({ platform, chat_id, file_path, video_base64, caption, duration }) => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          const adapter = gateway.adapters.get(platform)
          if (!adapter) {
            return { success: false, error: `Platform ${platform} not connected` }
          }

          try {
            let media
            if (file_path) {
              if (!fs.existsSync(file_path)) {
                return { success: false, error: `File not found: ${file_path}` }
              }
              media = file_path
            } else if (video_base64) {
              media = Buffer.from(video_base64, 'base64')
            } else {
              return { success: false, error: 'Either file_path or video_base64 is required' }
            }

            await adapter.sendVideo(chat_id, media, { caption, duration })
            return { success: true, platform, chat_id }
          } catch (err) {
            return { success: false, error: err.message }
          }
        }
      ),

      tool(
        'send_audio',
        'Send an audio file or voice note to a specific chat.',
        {
          platform: z.enum(['whatsapp', 'imessage', 'telegram']).describe('The messaging platform'),
          chat_id: z.string().describe('The chat ID to send to'),
          file_path: z.string().optional().describe('Path to the audio file'),
          audio_base64: z.string().optional().describe('Base64 encoded audio data'),
          as_voice: z.boolean().optional().describe('Send as voice note (WhatsApp/Telegram)'),
          duration: z.number().optional().describe('Duration in seconds')
        },
        async ({ platform, chat_id, file_path, audio_base64, as_voice, duration }) => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          const adapter = gateway.adapters.get(platform)
          if (!adapter) {
            return { success: false, error: `Platform ${platform} not connected` }
          }

          try {
            let media
            if (file_path) {
              if (!fs.existsSync(file_path)) {
                return { success: false, error: `File not found: ${file_path}` }
              }
              media = file_path
            } else if (audio_base64) {
              media = Buffer.from(audio_base64, 'base64')
            } else {
              return { success: false, error: 'Either file_path or audio_base64 is required' }
            }

            await adapter.sendAudio(chat_id, media, { asVoice: as_voice, duration })
            return { success: true, platform, chat_id }
          } catch (err) {
            return { success: false, error: err.message }
          }
        }
      ),

      tool(
        'send_file',
        'Send a file/document to a specific chat.',
        {
          platform: z.enum(['whatsapp', 'imessage', 'telegram']).describe('The messaging platform'),
          chat_id: z.string().describe('The chat ID to send to'),
          file_path: z.string().optional().describe('Path to the file'),
          file_base64: z.string().optional().describe('Base64 encoded file data'),
          filename: z.string().optional().describe('Filename for the attachment'),
          mime_type: z.string().optional().describe('MIME type of the file'),
          caption: z.string().optional().describe('Caption for the file')
        },
        async ({ platform, chat_id, file_path, file_base64, filename, mime_type, caption }) => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          const adapter = gateway.adapters.get(platform)
          if (!adapter) {
            return { success: false, error: `Platform ${platform} not connected` }
          }

          try {
            let media
            if (file_path) {
              if (!fs.existsSync(file_path)) {
                return { success: false, error: `File not found: ${file_path}` }
              }
              media = file_path
            } else if (file_base64) {
              media = Buffer.from(file_base64, 'base64')
            } else {
              return { success: false, error: 'Either file_path or file_base64 is required' }
            }

            await adapter.sendFile(chat_id, media, { filename, mimeType: mime_type, caption })
            return { success: true, platform, chat_id }
          } catch (err) {
            return { success: false, error: err.message }
          }
        }
      ),

      tool(
        'list_platforms',
        'List all connected messaging platforms and their status',
        {},
        async () => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          const platforms = []
          for (const [name, adapter] of gateway.adapters) {
            platforms.push({
              name,
              connected: !!adapter.sock || !!adapter.bot || !!adapter.process
            })
          }

          return { success: true, platforms }
        }
      ),

      tool(
        'get_queue_status',
        'Get the current queue status for all sessions or a specific session',
        {
          session_key: z.string().optional().describe('Optional session key to check specific session')
        },
        async ({ session_key }) => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          if (session_key) {
            const status = gateway.agentRunner.getQueueStatus(session_key)
            return { success: true, session: session_key, ...status }
          }

          const globalStats = gateway.agentRunner.getGlobalStats()
          return { success: true, ...globalStats }
        }
      ),

      tool(
        'get_current_context',
        'Get information about the current conversation context (platform, chat, session)',
        {},
        async () => {
          const { currentPlatform, currentChatId, currentSessionKey } = gatewayContext
          return {
            success: true,
            platform: currentPlatform,
            chat_id: currentChatId,
            session_key: currentSessionKey
          }
        }
      ),

      tool(
        'list_sessions',
        'List all active sessions with their last activity time',
        {},
        async () => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          const sessions = []
          for (const [key, data] of gateway.agentRunner.agent.sessions) {
            sessions.push({
              key,
              message_count: data.messageCount,
              last_activity: new Date(data.lastActivity).toISOString(),
              created: new Date(data.createdAt).toISOString()
            })
          }

          return { success: true, sessions, count: sessions.length }
        }
      ),

      tool(
        'broadcast_message',
        'Send a message to multiple chats across platforms. Use with caution.',
        {
          targets: z.array(z.object({
            platform: z.enum(['whatsapp', 'imessage', 'telegram']),
            chat_id: z.string()
          })).describe('Array of targets to send to'),
          message: z.string().describe('The message to broadcast')
        },
        async ({ targets, message }) => {
          const { gateway } = gatewayContext
          if (!gateway) {
            return { success: false, error: 'Gateway not available' }
          }

          const results = []
          for (const target of targets) {
            const adapter = gateway.adapters.get(target.platform)
            if (!adapter) {
              results.push({ ...target, success: false, error: 'Platform not connected' })
              continue
            }

            try {
              await adapter.sendMessage(target.chat_id, message)
              results.push({ ...target, success: true })
            } catch (err) {
              results.push({ ...target, success: false, error: err.message })
            }
          }

          const successful = results.filter(r => r.success).length
          return { success: true, sent: successful, failed: results.length - successful, results }
        }
      )
    ]
  })
}
