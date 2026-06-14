import TelegramBot from 'node-telegram-bot-api'
import fs from 'fs'
import path from 'path'
import BaseAdapter from './base.js'

/**
 * Telegram adapter using node-telegram-bot-api
 * Supports text, images, videos, audio, and file messages
 */
export default class TelegramAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.bot = null
    this.botInfo = null
  }

  async start() {
    if (!this.config.token) {
      throw new Error('Telegram bot token is required. Get one from @BotFather')
    }

    this.bot = new TelegramBot(this.config.token, { polling: true })

    this.botInfo = await this.bot.getMe()
    console.log(`[Telegram] Connected as @${this.botInfo.username}`)

    this.bot.on('message', async (msg) => {
      await this.handleMessage(msg)
    })

    this.bot.on('polling_error', (err) => {
      console.error('[Telegram] Polling error:', err.message)
    })

    console.log('[Telegram] Adapter started')
  }

  async stop() {
    if (this.bot) {
      await this.bot.stopPolling()
      this.bot = null
    }
    console.log('[Telegram] Adapter stopped')
  }

  async sendMessage(chatId, text) {
    if (!this.bot) {
      throw new Error('Telegram not connected')
    }

    if (text.length > 4096) {
      const chunks = this.splitMessage(text, 4096)
      for (const chunk of chunks) {
        await this.bot.sendMessage(chatId, chunk)
      }
    } else {
      await this.bot.sendMessage(chatId, text)
    }
  }

  async sendImage(chatId, media, options = {}) {
    if (!this.bot) throw new Error('Telegram not connected')

    const input = Buffer.isBuffer(media) ? media : fs.createReadStream(media)
    await this.bot.sendPhoto(chatId, input, {
      caption: options.caption || '',
      parse_mode: options.parseMode || undefined
    })
  }

  async sendVideo(chatId, media, options = {}) {
    if (!this.bot) throw new Error('Telegram not connected')

    const input = Buffer.isBuffer(media) ? media : fs.createReadStream(media)
    await this.bot.sendVideo(chatId, input, {
      caption: options.caption || '',
      duration: options.duration || undefined,
      parse_mode: options.parseMode || undefined
    })
  }

  async sendAudio(chatId, media, options = {}) {
    if (!this.bot) throw new Error('Telegram not connected')

    const input = Buffer.isBuffer(media) ? media : fs.createReadStream(media)

    if (options.asVoice) {
      await this.bot.sendVoice(chatId, input, {
        duration: options.duration || undefined
      })
    } else {
      await this.bot.sendAudio(chatId, input, {
        duration: options.duration || undefined,
        performer: options.performer || undefined,
        title: options.title || undefined
      })
    }
  }

  async sendFile(chatId, media, options = {}) {
    if (!this.bot) throw new Error('Telegram not connected')

    const input = Buffer.isBuffer(media) ? media : fs.createReadStream(media)
    await this.bot.sendDocument(chatId, input, {
      caption: options.caption || '',
      parse_mode: options.parseMode || undefined
    }, {
      filename: options.filename || undefined
    })
  }

  splitMessage(text, maxLength) {
    const chunks = []
    let remaining = text
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining)
        break
      }
      let breakPoint = remaining.lastIndexOf('\n', maxLength)
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf(' ', maxLength)
      }
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = maxLength
      }
      chunks.push(remaining.substring(0, breakPoint))
      remaining = remaining.substring(breakPoint).trim()
    }
    return chunks
  }

  async sendTyping(chatId) {
    if (!this.bot) return
    try {
      await this.bot.sendChatAction(chatId, 'typing')
    } catch (err) {
      // Ignore
    }
  }

  /**
   * Download file from Telegram
   */
  async downloadFile(fileId) {
    try {
      const fileLink = await this.bot.getFileLink(fileId)
      const response = await fetch(fileLink)
      return Buffer.from(await response.arrayBuffer())
    } catch (err) {
      console.error('[Telegram] Failed to download file:', err.message)
      return null
    }
  }

  async handleMessage(msg) {
    if (!msg.text && !msg.photo && !msg.video && !msg.audio && !msg.voice && !msg.document && !msg.caption) return

    const chatId = msg.chat.id.toString()
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'
    const sender = msg.from?.id?.toString() || chatId

    let text = msg.text || msg.caption || ''

    let image = null
    let video = null
    let audio = null
    let files = []

    if (msg.photo && msg.photo.length > 0) {
      const photo = msg.photo[msg.photo.length - 1]
      const buffer = await this.downloadFile(photo.file_id)
      if (buffer) {
        image = {
          data: buffer.toString('base64'),
          mediaType: 'image/jpeg'
        }
        console.log('[Telegram] Image downloaded, size:', buffer.length)
      }
      if (!text) text = '[Image]'
    }

    if (msg.video) {
      const buffer = await this.downloadFile(msg.video.file_id)
      if (buffer) {
        video = {
          data: buffer.toString('base64'),
          mediaType: msg.video.mime_type || 'video/mp4',
          duration: msg.video.duration || 0
        }
        console.log('[Telegram] Video downloaded, size:', buffer.length)
      }
      if (!text) text = '[Video]'
    }

    if (msg.audio) {
      const buffer = await this.downloadFile(msg.audio.file_id)
      if (buffer) {
        audio = {
          data: buffer.toString('base64'),
          mediaType: msg.audio.mime_type || 'audio/mpeg',
          duration: msg.audio.duration || 0,
          isVoice: false
        }
        console.log('[Telegram] Audio downloaded, size:', buffer.length)
      }
      if (!text) text = '[Audio]'
    }

    if (msg.voice) {
      const buffer = await this.downloadFile(msg.voice.file_id)
      if (buffer) {
        audio = {
          data: buffer.toString('base64'),
          mediaType: msg.voice.mime_type || 'audio/ogg',
          duration: msg.voice.duration || 0,
          isVoice: true
        }
        console.log('[Telegram] Voice note downloaded, size:', buffer.length)
      }
      if (!text) text = '[Voice Note]'
    }

    if (msg.document) {
      const buffer = await this.downloadFile(msg.document.file_id)
      if (buffer) {
        files.push({
          data: buffer.toString('base64'),
          mediaType: msg.document.mime_type || 'application/octet-stream',
          filename: msg.document.file_name || 'file'
        })
        console.log('[Telegram] Document downloaded, size:', buffer.length)
      }
      if (!text) text = `[File: ${msg.document.file_name || 'document'}]`
    }

    if (!text && !image && !video && !audio && files.length === 0) return

    const botMentioned = text.includes(`@${this.botInfo.username}`)
    if (botMentioned) {
      text = text.replace(`@${this.botInfo.username}`, '').trim()
    }

    const message = {
      chatId,
      text,
      isGroup,
      sender,
      mentions: botMentioned ? ['self'] : [],
      image,
      video,
      audio,
      files,
      raw: msg
    }

    if (!this.shouldRespond(message, this.config)) {
      return
    }

    this.emitMessage(message)
  }
}
