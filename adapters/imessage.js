import { spawn, execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import BaseAdapter from './base.js'

const IMSG_PATH = process.env.IMSG_PATH || path.join(os.homedir(), 'bin', 'imsg')

/**
 * iMessage adapter using imsg CLI
 * Supports text, images, videos, audio, and file messages
 */
export default class iMessageAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.watchProcess = null
    this.buffer = ''
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.watchProcess = spawn(IMSG_PATH, ['watch', '--json'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.watchProcess.on('error', (err) => {
        console.error('[iMessage] Failed to start imsg watch:', err.message)
        console.log('[iMessage] Make sure imsg is installed at:', IMSG_PATH)
        console.log('[iMessage] Grant Full Disk Access to your terminal in System Settings > Privacy & Security')
        reject(err)
      })

      this.watchProcess.on('close', (code) => {
        console.log(`[iMessage] Watch process exited with code ${code}`)
        this.watchProcess = null
      })

      this.watchProcess.stdout.on('data', (data) => {
        this.handleData(data.toString())
      })

      this.watchProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg) {
          console.error('[iMessage] stderr:', msg)
        }
      })

      setTimeout(() => {
        if (this.watchProcess && !this.watchProcess.killed) {
          console.log('[iMessage] Adapter started, watching for messages...')
          resolve()
        }
      }, 1000)
    })
  }

  async stop() {
    if (this.watchProcess) {
      this.watchProcess.kill()
      this.watchProcess = null
    }
    console.log('[iMessage] Adapter stopped')
  }

  handleData(data) {
    this.buffer += data
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop()

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const json = JSON.parse(line)
        this.handleMessage(json)
      } catch (err) {
        if (!line.startsWith('[') && !line.includes('watching')) {
          console.log('[iMessage] Non-JSON output:', line)
        }
      }
    }
  }

  handleMessage(msg) {
    if (msg.is_from_me) return

    const chatId = msg.chat_id?.toString() || msg.chat_identifier
    const text = msg.text
    const sender = msg.sender || msg.handle_id

    if (!chatId) return

    const isGroup = msg.chat_identifier?.includes(',') || msg.participants?.length > 2

    const mentions = []
    if (text?.includes('@')) {
      mentions.push('potential')
    }

    let image = null
    let video = null
    let audio = null
    let files = []

    if (msg.attachments && msg.attachments.length > 0) {
      for (const attachment of msg.attachments) {
        const filePath = attachment.file_path || attachment.path
        if (!filePath || !fs.existsSync(filePath)) continue

        const buffer = fs.readFileSync(filePath)
        const mimeType = attachment.mime_type || this._getMimeType(filePath)
        const filename = path.basename(filePath)

        if (mimeType.startsWith('image/')) {
          image = {
            data: buffer.toString('base64'),
            mediaType: mimeType
          }
          console.log('[iMessage] Image received:', filename)
        } else if (mimeType.startsWith('video/')) {
          video = {
            data: buffer.toString('base64'),
            mediaType: mimeType,
            duration: attachment.duration || 0
          }
          console.log('[iMessage] Video received:', filename)
        } else if (mimeType.startsWith('audio/')) {
          audio = {
            data: buffer.toString('base64'),
            mediaType: mimeType,
            duration: attachment.duration || 0,
            isVoice: mimeType.includes('caf') || mimeType.includes('voice')
          }
          console.log('[iMessage] Audio received:', filename)
        } else {
          files.push({
            data: buffer.toString('base64'),
            mediaType: mimeType,
            filename
          })
          console.log('[iMessage] File received:', filename)
        }
      }
    }

    const messageText = text || (image ? '[Image]' : '') || (video ? '[Video]' : '') || (audio ? '[Audio]' : '') || (files.length > 0 ? `[File: ${files[0].filename}]` : '')

    const message = {
      chatId,
      text: messageText,
      isGroup: Boolean(isGroup),
      sender,
      mentions,
      image,
      video,
      audio,
      files,
      raw: msg
    }

    console.log(`[iMessage] Received: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}" from ${sender}`)

    if (!this.shouldRespond(message, this.config)) {
      console.log('[iMessage] Skipping - not in allowlist or mention required')
      return
    }

    this.emitMessage(message)
  }

  _getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.caf': 'audio/x-caf',
      '.ogg': 'audio/ogg',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain'
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  async sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {
      const args = ['send', '--chat-id', chatId.toString(), '--text', text]

      execFile(IMSG_PATH, args, (error, stdout, stderr) => {
        if (error) {
          console.error('[iMessage] Failed to send message:', error.message)
          if (stderr) console.error('[iMessage] stderr:', stderr)
          reject(error)
          return
        }

        console.log('[iMessage] Message sent successfully')
        resolve()
      })
    })
  }

  async sendImage(chatId, media, options = {}) {
    const filePath = typeof media === 'string' ? media : await this._bufferToTempFile(media, 'image.jpg')

    return new Promise((resolve, reject) => {
      const args = ['send', '--chat-id', chatId.toString(), '--attachment', filePath]

      if (options.caption) {
        args.push('--text', options.caption)
      }

      execFile(IMSG_PATH, args, (error, stdout, stderr) => {
        if (typeof media !== 'string') {
          fs.unlink(filePath, () => {})
        }

        if (error) {
          console.error('[iMessage] Failed to send image:', error.message)
          reject(error)
          return
        }

        console.log('[iMessage] Image sent successfully')
        resolve()
      })
    })
  }

  async sendVideo(chatId, media, options = {}) {
    const filePath = typeof media === 'string' ? media : await this._bufferToTempFile(media, 'video.mp4')

    return new Promise((resolve, reject) => {
      const args = ['send', '--chat-id', chatId.toString(), '--attachment', filePath]

      if (options.caption) {
        args.push('--text', options.caption)
      }

      execFile(IMSG_PATH, args, (error, stdout, stderr) => {
        if (typeof media !== 'string') {
          fs.unlink(filePath, () => {})
        }

        if (error) {
          console.error('[iMessage] Failed to send video:', error.message)
          reject(error)
          return
        }

        console.log('[iMessage] Video sent successfully')
        resolve()
      })
    })
  }

  async sendAudio(chatId, media, options = {}) {
    const filePath = typeof media === 'string' ? media : await this._bufferToTempFile(media, 'audio.m4a')

    return new Promise((resolve, reject) => {
      const args = ['send', '--chat-id', chatId.toString(), '--attachment', filePath]

      if (options.caption) {
        args.push('--text', options.caption)
      }

      execFile(IMSG_PATH, args, (error, stdout, stderr) => {
        if (typeof media !== 'string') {
          fs.unlink(filePath, () => {})
        }

        if (error) {
          console.error('[iMessage] Failed to send audio:', error.message)
          reject(error)
          return
        }

        console.log('[iMessage] Audio sent successfully')
        resolve()
      })
    })
  }

  async sendFile(chatId, media, options = {}) {
    const filePath = typeof media === 'string' ? media : await this._bufferToTempFile(media, options.filename || 'file')

    return new Promise((resolve, reject) => {
      const args = ['send', '--chat-id', chatId.toString(), '--attachment', filePath]

      if (options.caption) {
        args.push('--text', options.caption)
      }

      execFile(IMSG_PATH, args, (error, stdout, stderr) => {
        if (typeof media !== 'string') {
          fs.unlink(filePath, () => {})
        }

        if (error) {
          console.error('[iMessage] Failed to send file:', error.message)
          reject(error)
          return
        }

        console.log('[iMessage] File sent successfully')
        resolve()
      })
    })
  }

  async _bufferToTempFile(buffer, filename) {
    const tempPath = path.join(os.tmpdir(), `maverick-${Date.now()}-${filename}`)
    fs.writeFileSync(tempPath, buffer)
    return tempPath
  }
}
