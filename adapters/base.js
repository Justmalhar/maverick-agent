/**
 * Base adapter interface for messaging platforms
 */
export default class BaseAdapter {
  constructor(config) {
    this.config = config
    this.messageCallback = null
  }

  /**
   * Connect and start listening for messages
   */
  async start() {
    throw new Error('start() must be implemented by subclass')
  }

  /**
   * Disconnect and stop listening
   */
  async stop() {
    throw new Error('stop() must be implemented by subclass')
  }

  /**
   * Send a text message to a chat
   * @param {string} chatId - The chat identifier
   * @param {string} text - The message text to send
   */
  async sendMessage(chatId, text) {
    throw new Error('sendMessage() must be implemented by subclass')
  }

  /**
   * Send an image to a chat
   * @param {string} chatId - The chat identifier
   * @param {Buffer|string} media - Image buffer or file path
   * @param {Object} options - Additional options
   * @param {string} [options.caption] - Caption for the image
   * @param {string} [options.mimeType] - MIME type (e.g., 'image/jpeg')
   * @param {string} [options.filename] - Filename for the attachment
   */
  async sendImage(chatId, media, options = {}) {
    throw new Error('sendImage() must be implemented by subclass')
  }

  /**
   * Send a video to a chat
   * @param {string} chatId - The chat identifier
   * @param {Buffer|string} media - Video buffer or file path
   * @param {Object} options - Additional options
   * @param {string} [options.caption] - Caption for the video
   * @param {string} [options.mimeType] - MIME type (e.g., 'video/mp4')
   * @param {string} [options.filename] - Filename for the attachment
   * @param {number} [options.duration] - Duration in seconds
   */
  async sendVideo(chatId, media, options = {}) {
    throw new Error('sendVideo() must be implemented by subclass')
  }

  /**
   * Send an audio/voice note to a chat
   * @param {string} chatId - The chat identifier
   * @param {Buffer|string} media - Audio buffer or file path
   * @param {Object} options - Additional options
   * @param {string} [options.mimeType] - MIME type (e.g., 'audio/mp3', 'audio/ogg')
   * @param {string} [options.filename] - Filename for the attachment
   * @param {number} [options.duration] - Duration in seconds
   * @param {boolean} [options.asVoice] - Send as voice note (WhatsApp/Telegram)
   */
  async sendAudio(chatId, media, options = {}) {
    throw new Error('sendAudio() must be implemented by subclass')
  }

  /**
   * Send a file/document to a chat
   * @param {string} chatId - The chat identifier
   * @param {Buffer|string} media - File buffer or file path
   * @param {Object} options - Additional options
   * @param {string} [options.filename] - Filename for the attachment
   * @param {string} [options.mimeType] - MIME type
   * @param {string} [options.caption] - Caption/description
   */
  async sendFile(chatId, media, options = {}) {
    throw new Error('sendFile() must be implemented by subclass')
  }

  /**
   * Send a media message with automatic type detection
   * @param {string} chatId - The chat identifier
   * @param {Buffer|string} media - Media buffer or file path
   * @param {Object} options - Additional options
   * @param {string} [options.type] - Force media type: 'image', 'video', 'audio', 'file'
   * @param {string} [options.mimeType] - MIME type
   * @param {string} [options.caption] - Caption
   * @param {string} [options.filename] - Filename
   */
  async sendMedia(chatId, media, options = {}) {
    const type = options.type || this._detectMediaType(media, options.mimeType)
    
    switch (type) {
      case 'image':
        return this.sendImage(chatId, media, options)
      case 'video':
        return this.sendVideo(chatId, media, options)
      case 'audio':
        return this.sendAudio(chatId, media, options)
      default:
        return this.sendFile(chatId, media, options)
    }
  }

  /**
   * Detect media type from buffer or MIME type
   */
  _detectMediaType(media, mimeType) {
    if (mimeType) {
      if (mimeType.startsWith('image/')) return 'image'
      if (mimeType.startsWith('video/')) return 'video'
      if (mimeType.startsWith('audio/')) return 'audio'
      return 'file'
    }

    // Detect from buffer magic bytes
    if (Buffer.isBuffer(media)) {
      if (media[0] === 0xFF && media[1] === 0xD8) return 'image' // JPEG
      if (media[0] === 0x89 && media[1] === 0x50) return 'image' // PNG
      if (media[0] === 0x47 && media[1] === 0x49) return 'image' // GIF
      if (media[0] === 0x52 && media[1] === 0x49) return 'image' // RIFF (WEBP)
      if (media[0] === 0x1A && media[1] === 0x45) return 'video' // WebM
      if (media[0] === 0x66 && media[1] === 0x74) return 'video' // ftyp (MP4)
      if (media[0] === 0x4F && media[1] === 0x67) return 'audio' // Ogg
      if (media[0] === 0x49 && media[1] === 0x44) return 'audio' // ID3 (MP3)
    }

    return 'file'
  }

  /**
   * Register a callback for incoming messages
   * @param {Function} callback - Called with (message) object containing:
   *   - chatId: string
   *   - text: string
   *   - isGroup: boolean
   *   - sender: string
   *   - mentions: string[]
   *   - image: Object (base64 data, mediaType)
   *   - video: Object (base64 data, mediaType, duration)
   *   - audio: Object (base64 data, mediaType, duration, isVoice)
   *   - files: Array<Object> (base64 data, mediaType, filename)
   *   - raw: any (platform-specific data)
   */
  onMessage(callback) {
    this.messageCallback = callback
  }

  /**
   * Emit a message to the registered callback
   */
  emitMessage(message) {
    if (this.messageCallback) {
      this.messageCallback(message)
    }
  }

  /**
   * Check if we should respond to a message based on allowlists and mention gating
   * @param {Object} message - The message object
   * @param {Object} config - Platform-specific config
   * @returns {boolean}
   */
  shouldRespond(message, config) {
    const { chatId, isGroup, sender, mentions } = message

    if (isGroup) {
      if (config.allowedGroups.length === 0) {
        console.log(`[Security] Blocked group message from ${chatId} (no groups allowed)`)
        return false
      }
      if (!config.allowedGroups.includes('*') && !config.allowedGroups.includes(chatId)) {
        console.log(`[Security] Blocked group message from ${chatId} (not in allowlist)`)
        return false
      }
      if (config.respondToMentionsOnly && mentions && !mentions.includes('self')) {
        return false
      }
    } else {
      if (config.allowedDMs.length === 0) {
        console.log(`[Security] Blocked DM from ${sender || chatId} (no DMs allowed — set allowedDMs in .env)`)
        return false
      }
      if (!config.allowedDMs.includes('*') && !config.allowedDMs.includes(chatId)) {
        console.log(`[Security] Blocked DM from ${sender || chatId} (not in allowlist)`)
        return false
      }
    }

    return true
  }

  /**
   * Generate a session key for this message
   * @param {string} agentId - The agent identifier
   * @param {string} platform - Platform name
   * @param {Object} message - The message object
   * @returns {string}
   */
  generateSessionKey(agentId, platform, message) {
    const type = message.isGroup ? 'group' : 'dm'
    return `agent:${agentId}:${platform}:${type}:${message.chatId}`
  }
}
