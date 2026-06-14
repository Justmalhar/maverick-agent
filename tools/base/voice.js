import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import os from 'os'

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'
const FAL_API = 'https://fal.run'
const REPLICATE_API = 'https://api.replicate.com/v1'
const GROQ_API = 'https://api.groq.com/openai/v1'
const OPENAI_API = 'https://api.openai.com/v1'
const DEEPGRAM_API = 'https://api.deepgram.com/v1'
const KOKORO_API = process.env.KOKORO_API_URL || 'http://localhost:8880'

function getElevenLabsHeaders() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY environment variable is not set')
  return { 'xi-api-key': apiKey, 'Content-Type': 'application/json' }
}

function getFalHeaders() {
  const apiKey = process.env.FAL_API_KEY
  if (!apiKey) throw new Error('FAL_API_KEY environment variable is not set')
  return { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' }
}

function getReplicateHeaders() {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) throw new Error('REPLICATE_API_TOKEN environment variable is not set')
  return { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
}

function getGroqHeaders() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable is not set')
  return { Authorization: `Bearer ${apiKey}` }
}

function getOpenAIHeaders() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set')
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

function getDeepgramHeaders() {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY environment variable is not set')
  return { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' }
}

function getKokoroHeaders() {
  return { 'Content-Type': 'application/json' }
}

function hasElevenLabs() { return !!process.env.ELEVENLABS_API_KEY }
function hasFal() { return !!process.env.FAL_API_KEY }
function hasReplicate() { return !!process.env.REPLICATE_API_TOKEN }
function hasGroq() { return !!process.env.GROQ_API_KEY }
function hasOpenAI() { return !!process.env.OPENAI_API_KEY }
function hasDeepgram() { return !!process.env.DEEPGRAM_API_KEY }
function hasKokoro() { return !!process.env.KOKORO_API_URL || process.env.KOKORO_ENABLED === 'true' }

function getTempDir() {
  const dir = path.join(os.tmpdir(), 'maverick-voice')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeAudioToFile(audioBuffer, filename) {
  const dir = getTempDir()
  const filePath = path.join(dir, filename)
  fs.writeFileSync(filePath, audioBuffer)
  return filePath
}

// ─── TTS Providers ─────────────────────────────────────────────

async function ttsElevenLabs(text, voiceId, outputPath) {
  const vid = voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
  const response = await fetch(`${ELEVENLABS_API}/text-to-speech/${vid}`, {
    method: 'POST',
    headers: getElevenLabsHeaders(),
    body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1' })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`ElevenLabs TTS error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())

  if (outputPath) {
    const dir = path.dirname(outputPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(outputPath, audioBuffer)
    return { file_path: outputPath, format: 'mp3' }
  }

  const filename = `tts_${Date.now()}.mp3`
  const filePath = writeAudioToFile(audioBuffer, filename)
  return { audio_base64: audioBuffer.toString('base64'), format: 'mp3', file_path: filePath }
}

async function ttsFal(text, voiceId, outputPath) {
  const modelId = voiceId || 'fal-ai/elevenlabs/tts/turbo-v2.5'
  const response = await fetch(`${FAL_API}/${modelId}`, {
    method: 'POST',
    headers: getFalHeaders(),
    body: JSON.stringify({ text })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`Fal.ai TTS error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const data = await response.json()

  // fal returns { audio: { url: '...' } } — fetch the actual audio
  if (data.audio?.url) {
    const audioResponse = await fetch(data.audio.url)
    if (!audioResponse.ok) throw new Error(`Failed to download audio from Fal: ${audioResponse.statusText}`)
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

    if (outputPath) {
      const dir = path.dirname(outputPath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(outputPath, audioBuffer)
      return { file_path: outputPath, format: 'mp3' }
    }

    const filename = `tts_fal_${Date.now()}.mp3`
    const filePath = writeAudioToFile(audioBuffer, filename)
    return { audio_base64: audioBuffer.toString('base64'), format: 'mp3', file_path: filePath }
  }

  return data
}

async function ttsOpenAI(text, voiceId, outputPath) {
  const voice = voiceId || 'alloy'
  const response = await fetch(`${OPENAI_API}/audio/speech`, {
    method: 'POST',
    headers: getOpenAIHeaders(),
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: text,
      voice,
      response_format: 'mp3'
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`OpenAI TTS error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())

  if (outputPath) {
    const dir = path.dirname(outputPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(outputPath, audioBuffer)
    return { file_path: outputPath, format: 'mp3' }
  }

  const filename = `tts_openai_${Date.now()}.mp3`
  const filePath = writeAudioToFile(audioBuffer, filename)
  return { audio_base64: audioBuffer.toString('base64'), format: 'mp3', file_path: filePath }
}

async function ttsKokoro(text, voiceId, outputPath) {
  const voice = voiceId || 'af_heart'
  const response = await fetch(`${KOKORO_API}/v1/tts`, {
    method: 'POST',
    headers: getKokoroHeaders(),
    body: JSON.stringify({
      text,
      voice,
      format: 'mp3'
    })
  })

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText)
    throw new Error(`Kokoro TTS error (${response.status}): ${error}`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())

  if (outputPath) {
    const dir = path.dirname(outputPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(outputPath, audioBuffer)
    return { file_path: outputPath, format: 'mp3' }
  }

  const filename = `tts_kokoro_${Date.now()}.mp3`
  const filePath = writeAudioToFile(audioBuffer, filename)
  return { audio_base64: audioBuffer.toString('base64'), format: 'mp3', file_path: filePath }
}

async function ttsDeepgram(text, voiceId, outputPath) {
  const voice = voiceId || 'aura-asteria-en'
  const response = await fetch(`${DEEPGRAM_API}/tts`, {
    method: 'POST',
    headers: getDeepgramHeaders(),
    body: JSON.stringify({
      text,
      model: 'aura-2-thalia-en',
      encoding: 'mp3'
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`Deepgram TTS error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())

  if (outputPath) {
    const dir = path.dirname(outputPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(outputPath, audioBuffer)
    return { file_path: outputPath, format: 'mp3' }
  }

  const filename = `tts_deepgram_${Date.now()}.mp3`
  const filePath = writeAudioToFile(audioBuffer, filename)
  return { audio_base64: audioBuffer.toString('base64'), format: 'mp3', file_path: filePath }
}

// ─── STT Providers ─────────────────────────────────────────────

async function sttGroq(audioPath, audioBase64, language) {
  const formData = new FormData()

  if (audioPath) {
    const audioBuffer = fs.readFileSync(audioPath)
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
    formData.append('file', blob, path.basename(audioPath))
  } else if (audioBase64) {
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
    formData.append('file', blob, 'audio.mp3')
  } else {
    throw new Error('Either audio_path or audio_base64 is required')
  }

  formData.append('model', 'whisper-large-v3')
  if (language) formData.append('language', language)

  const response = await fetch(`${GROQ_API}/audio/transcriptions`, {
    method: 'POST',
    headers: getGroqHeaders(),
    body: formData
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`Groq STT error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const data = await response.json()
  return { text: data.text, language: data.language || language || 'unknown' }
}

async function sttFal(audioPath, audioBase64, language) {
  let audioUrl

  if (audioBase64) {
    // Fal expects a URL — upload as data URL or assume the caller provides a URL
    // For base64, we write to temp file and can't serve it, so we require a URL
    throw new Error('Fal.ai STT requires audio via URL. Use audio_url parameter or switch to Groq/Replicate for base64 input.')
  }

  if (audioPath) {
    // Read and base64 encode — fal accepts audio_url, not raw upload via /run
    // We need to upload the file first or provide a data URI
    const audioBuffer = fs.readFileSync(audioPath)
    const dataUri = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`
    audioUrl = dataUri
  }

  const modelId = 'fal-ai/whisper'

  const response = await fetch(`${FAL_API}/${modelId}`, {
    method: 'POST',
    headers: getFalHeaders(),
    body: JSON.stringify({ audio_url: audioUrl })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`Fal.ai STT error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const data = await response.json()
  return { text: data.text || data.transcription || JSON.stringify(data), language: language || 'unknown' }
}

async function sttReplicate(audioPath, audioBase64, language) {
  const modelVersion = 'openai/whisper:80998910d57b7325e65e8adfc02921db8030425a12c6098e5f3b2478d8037a15'

  let audioUrl
  if (audioBase64) {
    audioUrl = `data:audio/mpeg;base64,${audioBase64}`
  } else if (audioPath) {
    const audioBuffer = fs.readFileSync(audioPath)
    audioUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`
  } else {
    throw new Error('Either audio_path or audio_base64 is required')
  }

  const input = { audio: audioUrl }
  if (language) input.language = language

  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST',
    headers: getReplicateHeaders(),
    body: JSON.stringify({
      version: modelVersion.split(':')[1],
      input
    })
  })

  if (!createRes.ok) {
    const error = await createRes.json().catch(() => ({ detail: createRes.statusText }))
    throw new Error(`Replicate STT error (${createRes.status}): ${error.detail || JSON.stringify(error)}`)
  }

  let prediction = await createRes.json()

  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise(r => setTimeout(r, 1000))
    const pollRes = await fetch(`${REPLICATE_API}/predictions/${prediction.id}`, {
      headers: getReplicateHeaders()
    })
    prediction = await pollRes.json()
  }

  if (prediction.status === 'failed') {
    throw new Error(`Replicate STT failed: ${prediction.error}`)
  }

  return { text: prediction.output?.text || prediction.output || JSON.stringify(prediction.output), language: language || 'unknown' }
}

async function sttOpenAI(audioPath, audioBase64, language) {
  const formData = new FormData()

  if (audioPath) {
    const audioBuffer = fs.readFileSync(audioPath)
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
    formData.append('file', blob, path.basename(audioPath))
  } else if (audioBase64) {
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
    formData.append('file', blob, 'audio.mp3')
  } else {
    throw new Error('Either audio_path or audio_base64 is required')
  }

  formData.append('model', 'whisper-1')
  if (language) formData.append('language', language)

  const response = await fetch(`${OPENAI_API}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`OpenAI STT error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const data = await response.json()
  return { text: data.text, language: language || 'unknown' }
}

async function sttDeepgram(audioPath, audioBase64, language) {
  let audioBuffer
  if (audioPath) {
    audioBuffer = fs.readFileSync(audioPath)
  } else if (audioBase64) {
    audioBuffer = Buffer.from(audioBase64, 'base64')
  } else {
    throw new Error('Either audio_path or audio_base64 is required')
  }

  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    diarize: 'true',
    punctuate: 'true'
  })
  if (language) params.append('language', language)

  const response = await fetch(`${DEEPGRAM_API}/listen?${params}`, {
    method: 'POST',
    headers: {
      ...getDeepgramHeaders(),
      'Content-Type': 'audio/mpeg'
    },
    body: audioBuffer
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`Deepgram STT error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const data = await response.json()
  const channels = data.results?.channels || []
  const text = channels.map(ch => ch.alternatives?.[0]?.transcript).filter(Boolean).join(' ')
  return { text: text || '', language: language || data.results?.channels?.[0]?.detected_language || 'unknown' }
}

async function sttKokoro(audioPath, audioBase64, language) {
  const formData = new FormData()

  if (audioPath) {
    const audioBuffer = fs.readFileSync(audioPath)
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
    formData.append('file', blob, path.basename(audioPath))
  } else if (audioBase64) {
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
    formData.append('file', blob, 'audio.mp3')
  } else {
    throw new Error('Either audio_path or audio_base64 is required')
  }

  const response = await fetch(`${KOKORO_API}/v1/transcribe`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText)
    throw new Error(`Kokoro STT error (${response.status}): ${error}`)
  }

  const data = await response.json()
  return { text: data.text || data.transcript || JSON.stringify(data), language: language || 'unknown' }
}

// ─── List functions ────────────────────────────────────────────

async function listElevenLabsVoices() {
  const response = await fetch(`${ELEVENLABS_API}/voices`, {
    headers: getElevenLabsHeaders()
  })
  if (!response.ok) throw new Error(`ElevenLabs API error: ${response.statusText}`)
  const data = await response.json()
  return (data.voices || []).map(v => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels
  }))
}

async function listFalVoices() {
  return [
    { id: 'fal-ai/elevenlabs/tts/turbo-v2.5', name: 'ElevenLabs Turbo v2.5 via Fal', type: 'tts' },
    { id: 'fal-ai/elevenlabs/tts/multilingual-v2', name: 'ElevenLabs Multilingual v2 via Fal', type: 'tts' }
  ]
}

async function listReplicateVoices() {
  return [
    { id: 'jameshwang/xtts', name: 'XTTS v2 (Coqui)', type: 'tts' },
    { id: 'afiaka87/tortoise-tts', name: 'Tortoise TTS', type: 'tts' },
    { id: 'suno-ai/bark', name: 'Bark (Suno)', type: 'tts' }
  ]
}

async function listOpenAIVoices() {
  return [
    { id: 'alloy', name: 'Alloy', type: 'tts', gender: 'neutral' },
    { id: 'echo', name: 'Echo', type: 'tts', gender: 'male' },
    { id: 'fable', name: 'Fable', type: 'tts', gender: 'male' },
    { id: 'onyx', name: 'Onyx', type: 'tts', gender: 'male' },
    { id: 'nova', name: 'Nova', type: 'tts', gender: 'female' },
    { id: 'shimmer', name: 'Shimmer', type: 'tts', gender: 'female' }
  ]
}

async function listKokoroVoices() {
  return [
    { id: 'af_heart', name: 'Heart (American Female)', type: 'tts' },
    { id: 'af_bella', name: 'Bella (American Female)', type: 'tts' },
    { id: 'af_nicole', name: 'Nicole (American Female)', type: 'tts' },
    { id: 'af_sarah', name: 'Sarah (American Female)', type: 'tts' },
    { id: 'af_sky', name: 'Sky (American Female)', type: 'tts' },
    { id: 'am_adam', name: 'Adam (American Male)', type: 'tts' },
    { id: 'am_michael', name: 'Michael (American Male)', type: 'tts' },
    { id: 'bf_emma', name: 'Emma (British Female)', type: 'tts' },
    { id: 'bf_isabella', name: 'Isabella (British Female)', type: 'tts' },
    { id: 'bm_george', name: 'George (British Male)', type: 'tts' },
    { id: 'bm_lewis', name: 'Lewis (British Male)', type: 'tts' },
    { id: 'jf_alpha', name: 'Alpha (Japanese Female)', type: 'tts' },
    { id: 'jf_gongitsune', name: 'Gongitsune (Japanese Female)', type: 'tts' },
    { id: 'jf_nezumi', name: 'Nezumi (Japanese Female)', type: 'tts' },
    { id: 'jf_tebukuro', name: 'Tebukuro (Japanese Female)', type: 'tts' },
    { id: 'jm_kumo', name: 'Kumo (Japanese Male)', type: 'tts' },
    { id: 'zf_xiaobei', name: 'Xiaobei (Chinese Female)', type: 'tts' },
    { id: 'zf_xiaochi', name: 'Xiaochi (Chinese Female)', type: 'tts' },
    { id: 'zf_xiaohan', name: 'Xiaohan (Chinese Female)', type: 'tts' },
    { id: 'zf_xiaomeng', name: 'Xiaomeng (Chinese Female)', type: 'tts' },
    { id: 'zf_xiaoni', name: 'Xiaoni (Chinese Female)', type: 'tts' },
    { id: 'zf_xiaoxiao', name: 'Xiaoxiao (Chinese Female)', type: 'tts' },
    { id: 'zf_xiaoyi', name: 'Xiaoyi (Chinese Female)', type: 'tts' },
    { id: 'zm_yunxi', name: 'Yunxi (Chinese Male)', type: 'tts' }
  ]
}

async function listDeepgramVoices() {
  return [
    { id: 'aura-asteria-en', name: 'Asteria (English)', type: 'tts' },
    { id: 'aura-luna-en', name: 'Luna (English)', type: 'tts' },
    { id: 'aura-stella-en', name: 'Stella (English)', type: 'tts' },
    { id: 'aura-athena-en', name: 'Athena (English)', type: 'tts' },
    { id: 'aura-hera-en', name: 'Hera (English)', type: 'tts' },
    { id: 'aura-orion-en', name: 'Orion (English)', type: 'tts' },
    { id: 'aura-arcas-en', name: 'Arcas (English)', type: 'tts' },
    { id: 'aura-perseus-en', name: 'Perseus (English)', type: 'tts' },
    { id: 'aura-angus-en', name: 'Angus (English)', type: 'tts' },
    { id: 'aura-orpheus-en', name: 'Orpheus (English)', type: 'tts' },
    { id: 'aura-helios-en', name: 'Helios (English)', type: 'tts' },
    { id: 'aura-zeus-en', name: 'Zeus (English)', type: 'tts' }
  ]
}

async function listSttModelsGroq() {
  return [
    { id: 'whisper-large-v3', name: 'Whisper Large v3', type: 'stt' },
    { id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo', type: 'stt' },
    { id: 'distil-whisper-large-v3-en', name: 'Distil Whisper Large v3 (English)', type: 'stt' }
  ]
}

async function listSttModelsOpenAI() {
  return [
    { id: 'whisper-1', name: 'Whisper v1', type: 'stt' },
    { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe', type: 'stt' },
    { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', type: 'stt' }
  ]
}

async function listSttModelsDeepgram() {
  return [
    { id: 'nova-2', name: 'Nova 2', type: 'stt' },
    { id: 'nova-2-medical', name: 'Nova 2 Medical', type: 'stt' },
    { id: 'nova', name: 'Nova', type: 'stt' },
    { id: 'whisper-large', name: 'Whisper Large', type: 'stt' },
    { id: 'whisper-small', name: 'Whisper Small', type: 'stt' },
    { id: 'whisper-tiny', name: 'Whisper Tiny', type: 'stt' }
  ]
}

async function listSttModelsFal() {
  return [
    { id: 'fal-ai/whisper', name: 'Whisper via Fal', type: 'stt' }
  ]
}

async function listSttModelsReplicate() {
  return [
    { id: 'openai/whisper', name: 'Whisper (OpenAI)', type: 'stt' }
  ]
}

// ─── MCP Server ────────────────────────────────────────────────

export function createVoiceMcpServer() {
  const hasAnyTts = hasElevenLabs() || hasFal() || hasReplicate() || hasOpenAI() || hasKokoro() || hasDeepgram()
  const hasAnyStt = hasGroq() || hasFal() || hasReplicate() || hasOpenAI() || hasDeepgram() || hasKokoro()

  if (!hasAnyTts && !hasAnyStt) {
    console.log('[Voice] No voice provider API keys set, voice tools disabled')
    return null
  }

  console.log(`[Voice] TTS providers: ${[
    hasElevenLabs() ? 'elevenlabs' : null,
    hasFal() ? 'fal' : null,
    hasReplicate() ? 'replicate' : null,
    hasOpenAI() ? 'openai' : null,
    hasKokoro() ? 'kokoro' : null,
    hasDeepgram() ? 'deepgram' : null
  ].filter(Boolean).join(', ') || 'none'}`)

  console.log(`[Voice] STT providers: ${[
    hasGroq() ? 'groq' : null,
    hasFal() ? 'fal' : null,
    hasReplicate() ? 'replicate' : null,
    hasOpenAI() ? 'openai' : null,
    hasDeepgram() ? 'deepgram' : null,
    hasKokoro() ? 'kokoro' : null
  ].filter(Boolean).join(', ') || 'none'}`)

  return createSdkMcpServer({
    name: 'voice',
    version: '2.0.0',
    tools: [
      // ── TTS ──────────────────────────────────────────────
      tool(
        'text_to_speech',
        'Convert text to speech audio using a TTS provider. Returns base64 audio and file path.',
        {
          text: z.string().describe('Text to convert to speech'),
          provider: z.enum(['elevenlabs', 'fal', 'replicate', 'openai', 'kokoro', 'deepgram']).describe('TTS provider to use'),
          voice_id: z.string().optional().describe('Voice/model ID. Varies by provider: elevenlabs=voice_id, openai=alloy/echo/fable/onyx/nova/shimmer, kokoro=af_heart/af_bella/etc, deepgram=aura-asteria-en, fal=model_path, replicate=model_version'),
          output_path: z.string().optional().describe('File path to save audio. If omitted, saves to temp directory.')
        },
        async ({ text, provider, voice_id, output_path }) => {
          let result
          switch (provider) {
            case 'elevenlabs':
              if (!hasElevenLabs()) throw new Error('ELEVENLABS_API_KEY not set')
              result = await ttsElevenLabs(text, voice_id, output_path)
              break
            case 'fal':
              if (!hasFal()) throw new Error('FAL_API_KEY not set')
              result = await ttsFal(text, voice_id, output_path)
              break
            case 'replicate':
              if (!hasReplicate()) throw new Error('REPLICATE_API_TOKEN not set')
              result = await ttsReplicate(text, voice_id, output_path)
              break
            case 'openai':
              if (!hasOpenAI()) throw new Error('OPENAI_API_KEY not set')
              result = await ttsOpenAI(text, voice_id, output_path)
              break
            case 'kokoro':
              if (!hasKokoro()) throw new Error('KOKORO_API_URL not set')
              result = await ttsKokoro(text, voice_id, output_path)
              break
            case 'deepgram':
              if (!hasDeepgram()) throw new Error('DEEPGRAM_API_KEY not set')
              result = await ttsDeepgram(text, voice_id, output_path)
              break
            default:
              throw new Error(`Unknown TTS provider: ${provider}`)
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ provider, ...result }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_voices',
        'List available voices/models for a TTS provider.',
        {
          provider: z.enum(['elevenlabs', 'fal', 'replicate', 'openai', 'kokoro', 'deepgram']).describe('TTS provider to list voices for')
        },
        async ({ provider }) => {
          let voices
          switch (provider) {
            case 'elevenlabs':
              if (!hasElevenLabs()) throw new Error('ELEVENLABS_API_KEY not set')
              voices = await listElevenLabsVoices()
              break
            case 'fal':
              if (!hasFal()) throw new Error('FAL_API_KEY not set')
              voices = await listFalVoices()
              break
            case 'replicate':
              if (!hasReplicate()) throw new Error('REPLICATE_API_TOKEN not set')
              voices = await listReplicateVoices()
              break
            case 'openai':
              if (!hasOpenAI()) throw new Error('OPENAI_API_KEY not set')
              voices = await listOpenAIVoices()
              break
            case 'kokoro':
              voices = await listKokoroVoices()
              break
            case 'deepgram':
              if (!hasDeepgram()) throw new Error('DEEPGRAM_API_KEY not set')
              voices = await listDeepgramVoices()
              break
            default:
              throw new Error(`Unknown TTS provider: ${provider}`)
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ provider, count: voices.length, voices }, null, 2)
            }]
          }
        }
      ),

      // ── STT ──────────────────────────────────────────────
      tool(
        'speech_to_text',
        'Convert audio to text using an STT provider. Provide audio_path (file) or audio_base64 (base64 encoded audio).',
        {
          audio_path: z.string().optional().describe('Path to audio file (mp3, wav, m4a, etc.)'),
          audio_base64: z.string().optional().describe('Base64 encoded audio data'),
          provider: z.enum(['groq', 'fal', 'replicate', 'openai', 'deepgram', 'kokoro']).describe('STT provider to use'),
          language: z.string().optional().describe('Language code (e.g., "en", "es", "fr"). Omit for auto-detection.')
        },
        async ({ audio_path, audio_base64, provider, language }) => {
          if (!audio_path && !audio_base64) {
            throw new Error('Either audio_path or audio_base64 is required')
          }

          let result
          switch (provider) {
            case 'groq':
              if (!hasGroq()) throw new Error('GROQ_API_KEY not set')
              result = await sttGroq(audio_path, audio_base64, language)
              break
            case 'fal':
              if (!hasFal()) throw new Error('FAL_API_KEY not set')
              result = await sttFal(audio_path, audio_base64, language)
              break
            case 'replicate':
              if (!hasReplicate()) throw new Error('REPLICATE_API_TOKEN not set')
              result = await sttReplicate(audio_path, audio_base64, language)
              break
            case 'openai':
              if (!hasOpenAI()) throw new Error('OPENAI_API_KEY not set')
              result = await sttOpenAI(audio_path, audio_base64, language)
              break
            case 'deepgram':
              if (!hasDeepgram()) throw new Error('DEEPGRAM_API_KEY not set')
              result = await sttDeepgram(audio_path, audio_base64, language)
              break
            case 'kokoro':
              if (!hasKokoro()) throw new Error('KOKORO_API_URL not set')
              result = await sttKokoro(audio_path, audio_base64, language)
              break
            default:
              throw new Error(`Unknown STT provider: ${provider}`)
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ provider, ...result }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_stt_models',
        'List available STT models for a provider.',
        {
          provider: z.enum(['groq', 'fal', 'replicate', 'openai', 'deepgram', 'kokoro']).describe('STT provider to list models for')
        },
        async ({ provider }) => {
          let models
          switch (provider) {
            case 'groq':
              if (!hasGroq()) throw new Error('GROQ_API_KEY not set')
              models = await listSttModelsGroq()
              break
            case 'fal':
              if (!hasFal()) throw new Error('FAL_API_KEY not set')
              models = await listSttModelsFal()
              break
            case 'replicate':
              if (!hasReplicate()) throw new Error('REPLICATE_API_TOKEN not set')
              models = await listSttModelsReplicate()
              break
            case 'openai':
              if (!hasOpenAI()) throw new Error('OPENAI_API_KEY not set')
              models = await listSttModelsOpenAI()
              break
            case 'deepgram':
              if (!hasDeepgram()) throw new Error('DEEPGRAM_API_KEY not set')
              models = await listSttModelsDeepgram()
              break
            case 'kokoro':
              models = [{ id: 'whisper-1', name: 'Whisper (via Kokoro)', type: 'stt' }]
              break
            default:
              throw new Error(`Unknown STT provider: ${provider}`)
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ provider, count: models.length, models }, null, 2)
            }]
          }
        }
      )
    ]
  })
}
