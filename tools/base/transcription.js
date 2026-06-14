import fs from 'fs'
import path from 'path'
import os from 'os'

const GROQ_API = 'https://api.groq.com/openai/v1'

/**
 * Transcribe audio using Groq's Whisper API
 * @param {Buffer} audioBuffer - Audio data
 * @param {Object} options - Transcription options
 * @param {string} options.mimeType - Audio MIME type
 * @param {string} options.language - Language code (e.g., 'en')
 * @param {string} options.model - Model to use (default: whisper-large-v3-turbo)
 * @returns {Promise<Object>} Transcription result
 */
export async function transcribeAudio(audioBuffer, options = {}) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set')
  }

  const {
    mimeType = 'audio/ogg',
    language = 'en',
    model = 'whisper-large-v3-turbo'
  } = options

  // Determine file extension from MIME type
  const ext = getExtensionFromMime(mimeType)
  const tempFile = path.join(os.tmpdir(), `maverick-audio-${Date.now()}.${ext}`)

  try {
    // Write audio to temp file
    fs.writeFileSync(tempFile, audioBuffer)

    // Create form data
    const formData = new FormData()
    const audioBlob = new Blob([audioBuffer], { type: mimeType })
    formData.append('file', audioBlob, `audio.${ext}`)
    formData.append('model', model)
    formData.append('language', language)
    formData.append('response_format', 'verbose_json')
    formData.append('temperature', '0')

    const response = await fetch(`${GROQ_API}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(`Groq transcription error: ${error.error?.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      text: result.text,
      language: result.language,
      duration: result.duration,
      segments: result.segments?.map(s => ({
        start: s.start,
        end: s.end,
        text: s.text
      })) || []
    }
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile)
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Translate audio to English using Groq's Whisper API
 * @param {Buffer} audioBuffer - Audio data
 * @param {Object} options - Translation options
 * @returns {Promise<Object>} Translation result
 */
export async function translateAudio(audioBuffer, options = {}) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set')
  }

  const {
    mimeType = 'audio/ogg',
    model = 'whisper-large-v3'
  } = options

  const ext = getExtensionFromMime(mimeType)
  const formData = new FormData()
  const audioBlob = new Blob([audioBuffer], { type: mimeType })
  formData.append('file', audioBlob, `audio.${ext}`)
  formData.append('model', model)
  formData.append('response_format', 'json')
  formData.append('temperature', '0')

  const response = await fetch(`${GROQ_API}/audio/translations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(`Groq translation error: ${error.error?.message || response.statusText}`)
  }

  const result = await response.json()
  return { text: result.text }
}

function getExtensionFromMime(mimeType) {
  const mimeToExt = {
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac'
  }
  return mimeToExt[mimeType?.split(';')[0]?.trim()] || 'ogg'
}

/**
 * Check if Groq transcription is available
 */
export function isTranscriptionAvailable() {
  return !!process.env.GROQ_API_KEY
}
