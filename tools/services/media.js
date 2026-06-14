import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import os from 'os'

const FAL_API = 'https://fal.run'

function getFalHeaders() {
  const apiKey = process.env.FAL_API_KEY
  if (!apiKey) throw new Error('FAL_API_KEY environment variable is not set')
  return { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' }
}

function hasFal() { return !!process.env.FAL_API_KEY }

function getTempDir() {
  const dir = path.join(os.tmpdir(), 'maverick-media')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeMediaToFile(buffer, filename) {
  const dir = getTempDir()
  const filePath = path.join(dir, filename)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

// ─── Image Generation Models ──────────────────────────────────

const IMAGE_MODELS = {
  'flux-2': {
    id: 'fal-ai/flux-2',
    name: 'FLUX.2 Dev',
    description: 'Latest FLUX 2 dev - enhanced realism, LoRA support',
    cost: '$0.012/megapixel',
    params: { prompt: true, num_images: true, seed: true, image_size: true, num_inference_steps: true, enable_safety_checker: true }
  },
  'flux-schnell': {
    id: 'fal-ai/flux/schnell',
    name: 'FLUX Schnell',
    description: 'Ultra-fast 12B param model, 1-4 steps',
    cost: '$0.003/megapixel',
    params: { prompt: true, num_images: true, seed: true, image_size: true, enable_safety_checker: true }
  },
  'flux-dev': {
    id: 'fal-ai/flux/dev',
    name: 'FLUX Dev',
    description: 'High-quality 12B param, streaming support',
    cost: '$0.025/megapixel',
    params: { prompt: true, num_images: true, seed: true, image_size: true, num_inference_steps: true, enable_safety_checker: true }
  },
  'gpt-image-2': {
    id: 'openai/gpt-image-2',
    name: 'GPT Image 2',
    description: 'Best text rendering, complex scenes',
    cost: 'Variable (quality-based)',
    params: { prompt: true, quality: true, num_images: true, image_size: true, output_format: true }
  },
  'nano-banana-2': {
    id: 'fal-ai/nano-banana-2',
    name: 'Nano Banana 2',
    description: "Google Gemini 3.1 Flash - fast, vibrant output",
    cost: '$0.08/image',
    params: { prompt: true, aspect_ratio: true, resolution: true, enable_safety_checker: true }
  },
  'nano-banana-2-edit': {
    id: 'fal-ai/nano-banana-2/edit',
    name: 'Nano Banana 2 Edit',
    description: "Google Gemini 3.1 Flash - image editing/compositing",
    cost: '$0.08/image',
    params: { prompt: true, image_urls: true, aspect_ratio: true, resolution: true }
  },
  'nano-banana-pro': {
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro',
    description: "Google Gemini 3 Pro - highest quality, best reasoning",
    cost: '$0.15/image',
    params: { prompt: true, aspect_ratio: true, resolution: true, enable_safety_checker: true }
  },
  'ideogram-v3': {
    id: 'fal-ai/ideogram/v3',
    name: 'Ideogram V3',
    description: 'Exceptional typography handling',
    cost: '$0.03-$0.09/image',
    params: { prompt: true, aspect_ratio: true }
  },
  'recraft-v3': {
    id: 'fal-ai/recraft/v3/text-to-image',
    name: 'Recraft V3',
    description: 'Vector art, brand styles, text in images',
    cost: '$0.04/image',
    params: { prompt: true, style: true, size: true, colors: true }
  },
  'grok-imagine': {
    id: 'xai/grok-imagine-image',
    name: 'Grok Imagine',
    description: "xAI's image generation - fast, aesthetic",
    cost: '$0.02/image',
    params: { prompt: true, aspect_ratio: true, resolution: true, output_format: true }
  },
  'grok-imagine-edit': {
    id: 'xai/grok-imagine-image/edit',
    name: 'Grok Imagine Edit',
    description: "xAI's image editing - precise modifications",
    cost: '$0.022/image',
    params: { prompt: true, image_urls: true, resolution: true }
  }
}

// ─── Video Generation Models ──────────────────────────────────

const VIDEO_MODELS = {
  'seedance-i2v': {
    id: 'bytedance/seedance-2.0/image-to-video',
    name: 'Seedance 2.0 (Image to Video)',
    description: 'Animate images with audio, up to 1080p',
    cost: '$0.30/sec (720p), $0.68/sec (1080p)',
    params: { prompt: true, image_url: true, end_image_url: true, resolution: true, duration: true, generate_audio: true }
  },
  'seedance-i2v-fast': {
    id: 'bytedance/seedance-2.0/fast/image-to-video',
    name: 'Seedance 2.0 Fast (Image to Video)',
    description: 'Faster inference, up to 720p',
    cost: '$0.24/sec',
    params: { prompt: true, image_url: true, end_image_url: true, resolution: true, duration: true }
  },
  'seedance-t2v': {
    id: 'bytedance/seedance-2.0/text-to-video',
    name: 'Seedance 2.0 (Text to Video)',
    description: 'Generate video from text prompt',
    cost: '$0.30/sec (720p)',
    params: { prompt: true, resolution: true, duration: true }
  },
  'seedance-t2v-fast': {
    id: 'bytedance/seedance-2.0/fast/text-to-video',
    name: 'Seedance 2.0 Fast (Text to Video)',
    description: 'Fast text-to-video generation',
    cost: '$0.24/sec',
    params: { prompt: true, resolution: true, duration: true }
  },
  'grok-imagine-t2v': {
    id: 'xai/grok-imagine-video/text-to-video',
    name: 'Grok Imagine T2V',
    description: "xAI's text-to-video with audio",
    cost: '$0.05/sec (480p), $0.07/sec (720p)',
    params: { prompt: true, duration: true, resolution: true, aspect_ratio: true }
  },
  'grok-imagine-i2v': {
    id: 'xai/grok-imagine-video/image-to-video',
    name: 'Grok Imagine I2V',
    description: "xAI's image-to-video with audio",
    cost: '$0.05/sec (480p), $0.07/sec (720p)',
    params: { prompt: true, image_url: true, duration: true, resolution: true }
  },
  'grok-imagine-r2v': {
    id: 'xai/grok-imagine-video/reference-to-video',
    name: 'Grok Imagine R2V',
    description: "xAI's reference-to-video (multiple images)",
    cost: 'Variable',
    params: { prompt: true, image_urls: true, duration: true, resolution: true }
  }
}

// ─── Upscaling Models ─────────────────────────────────────────

const UPSCALE_MODELS = {
  'image': {
    id: 'fal-ai/topaz/upscale/image',
    name: 'Topaz Image Upscale',
    description: 'Professional image enhancement',
    cost: '$0.08-$1.36 (resolution dependent)',
    params: { image_url: true }
  },
  'video': {
    id: 'fal-ai/topaz/upscale/video',
    name: 'Topaz Video Upscale',
    description: 'Professional video upscaling',
    cost: '$0.01-$0.08/sec (resolution dependent)',
    params: { video_url: true }
  }
}

// ─── Core Functions ───────────────────────────────────────────

async function generateImage(modelKey, params) {
  const model = IMAGE_MODELS[modelKey]
  if (!model) throw new Error(`Unknown image model: ${modelKey}`)

  // Disable safety checker by default for all models that support it
  if (model.params.enable_safety_checker && params.enable_safety_checker === undefined) {
    params.enable_safety_checker = false
  }

  const response = await fetch(`${FAL_API}/${model.id}`, {
    method: 'POST',
    headers: getFalHeaders(),
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`Image generation error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const data = await response.json()

  if (data.images?.[0]?.url) {
    const imageResponse = await fetch(data.images[0].url)
    const buffer = Buffer.from(await imageResponse.arrayBuffer())
    const filename = `img_${modelKey}_${Date.now()}.png`
    const filePath = writeMediaToFile(buffer, filename)
    return {
      url: data.images[0].url,
      file_path: filePath,
      format: data.images[0].content_type || 'image/png',
      model: model.name,
      seed: data.seed
    }
  }

  return data
}

async function generateVideo(modelKey, params) {
  const model = VIDEO_MODELS[modelKey]
  if (!model) throw new Error(`Unknown video model: ${modelKey}`)

  const response = await fetch(`${FAL_API}/${model.id}`, {
    method: 'POST',
    headers: getFalHeaders(),
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`Video generation error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const data = await response.json()

  if (data.video?.url) {
    const videoResponse = await fetch(data.video.url)
    const buffer = Buffer.from(await videoResponse.arrayBuffer())
    const filename = `vid_${modelKey}_${Date.now()}.mp4`
    const filePath = writeMediaToFile(buffer, filename)
    return {
      url: data.video.url,
      file_path: filePath,
      format: 'video/mp4',
      model: model.name,
      seed: data.seed
    }
  }

  return data
}

async function upscaleMedia(type, params) {
  const model = UPSCALE_MODELS[type]
  if (!model) throw new Error(`Unknown upscale type: ${type}`)

  const response = await fetch(`${FAL_API}/${model.id}`, {
    method: 'POST',
    headers: getFalHeaders(),
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(`Upscale error (${response.status}): ${error.detail || JSON.stringify(error)}`)
  }

  const data = await response.json()

  if (type === 'image' && data.image?.url) {
    const imageResponse = await fetch(data.image.url)
    const buffer = Buffer.from(await imageResponse.arrayBuffer())
    const filename = `upscaled_${Date.now()}.png`
    const filePath = writeMediaToFile(buffer, filename)
    return {
      url: data.image.url,
      file_path: filePath,
      format: 'image/png',
      model: model.name
    }
  }

  if (type === 'video' && data.video?.url) {
    const videoResponse = await fetch(data.video.url)
    const buffer = Buffer.from(await videoResponse.arrayBuffer())
    const filename = `upscaled_${Date.now()}.mp4`
    const filePath = writeMediaToFile(buffer, filename)
    return {
      url: data.video.url,
      file_path: filePath,
      format: 'video/mp4',
      model: model.name
    }
  }

  return data
}

// ─── MCP Server ───────────────────────────────────────────────

export function createMediaMcpServer() {
  if (!hasFal()) {
    console.log('[Media] FAL_API_KEY not set, media tools disabled')
    return null
  }

  console.log('[Media] Image/video generation tools available')

  return createSdkMcpServer({
    name: 'media',
    version: '1.0.0',
    tools: [
      tool(
        'generate_image',
        'Generate an image using AI models via fal.ai. Safety filters disabled by default.',
        {
          model: z.enum(['flux-2', 'flux-schnell', 'flux-dev', 'gpt-image-2', 'nano-banana-2', 'nano-banana-2-edit', 'nano-banana-pro', 'ideogram-v3', 'recraft-v3', 'grok-imagine', 'grok-imagine-edit'])
            .describe('Image generation model to use'),
          prompt: z.string().describe('Text description of the image to generate'),
          image_urls: z.array(z.string()).optional()
            .describe('Reference images for editing models (nano-banana-2-edit, max 14)'),
          image_size: z.enum(['square', 'square_hd', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9']).optional()
            .describe('Image size preset (default: landscape_4_3)'),
          quality: z.enum(['low', 'medium', 'high']).optional()
            .describe('Quality setting (gpt-image-2 only, default: medium)'),
          style: z.enum(['realistic_image', 'digital_illustration', 'vector_illustration']).optional()
            .describe('Style preset (recraft-v3 only)'),
          resolution: z.enum(['512', '1K', '2K', '4K']).optional()
            .describe('Resolution (nano-banana models, default: 1K)'),
          num_images: z.number().optional().describe('Number of images to generate (default: 1)'),
          seed: z.number().optional().describe('Random seed for reproducibility'),
          aspect_ratio: z.string().optional()
            .describe('Aspect ratio (auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16)'),
          enable_safety_checker: z.boolean().optional()
            .describe('Enable safety filter (default: false for most models)'),
          output_path: z.string().optional().describe('File path to save image')
        },
        async ({ model, prompt, image_urls, image_size, quality, style, resolution, num_images, seed, aspect_ratio, enable_safety_checker, output_path }) => {
          const params = { prompt }
          if (image_urls) params.image_urls = image_urls
          if (image_size) params.image_size = image_size
          if (quality) params.quality = quality
          if (style) params.style = style
          if (resolution) params.resolution = resolution
          if (num_images) params.num_images = num_images
          if (seed !== undefined) params.seed = seed
          if (aspect_ratio) params.aspect_ratio = aspect_ratio
          if (enable_safety_checker !== undefined) params.enable_safety_checker = enable_safety_checker

          const result = await generateImage(model, params)

          if (output_path && result.file_path) {
            const dir = path.dirname(output_path)
            fs.mkdirSync(dir, { recursive: true })
            fs.copyFileSync(result.file_path, output_path)
            result.file_path = output_path
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_image_models',
        'List available image generation models with their capabilities and pricing.',
        {},
        async () => {
          const models = Object.entries(IMAGE_MODELS).map(([key, model]) => ({
            id: key,
            name: model.name,
            description: model.description,
            cost: model.cost,
            params: Object.keys(model.params)
          }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ count: models.length, models }, null, 2)
            }]
          }
        }
      ),

      tool(
        'generate_video',
        'Generate video using AI models via fal.ai. Supports image-to-video and text-to-video.',
        {
          model: z.enum(['seedance-i2v', 'seedance-i2v-fast', 'seedance-t2v', 'seedance-t2v-fast', 'grok-imagine-t2v', 'grok-imagine-i2v', 'grok-imagine-r2v'])
            .describe('Video generation model'),
          prompt: z.string().describe('Text description of the desired motion/action'),
          image_url: z.string().optional().describe('Starting frame URL (required for image-to-video models)'),
          end_image_url: z.string().optional().describe('Optional ending frame URL'),
          resolution: z.enum(['480p', '720p', '1080p']).optional().describe('Output resolution (default: 720p)'),
          duration: z.string().optional().describe('Duration in seconds or "auto" (default: auto)'),
          generate_audio: z.boolean().optional().describe('Generate synchronized audio (default: true)'),
          seed: z.number().optional().describe('Random seed for reproducibility'),
          output_path: z.string().optional().describe('File path to save video')
        },
        async ({ model, prompt, image_url, end_image_url, resolution, duration, generate_audio, seed, output_path }) => {
          if (['seedance-i2v', 'seedance-i2v-fast'].includes(model) && !image_url) {
            throw new Error('image_url is required for image-to-video models')
          }

          const params = { prompt }
          if (image_url) params.image_url = image_url
          if (end_image_url) params.end_image_url = end_image_url
          if (resolution) params.resolution = resolution
          if (duration) params.duration = duration
          if (generate_audio !== undefined) params.generate_audio = generate_audio
          if (seed !== undefined) params.seed = seed

          const result = await generateVideo(model, params)

          if (output_path && result.file_path) {
            const dir = path.dirname(output_path)
            fs.mkdirSync(dir, { recursive: true })
            fs.copyFileSync(result.file_path, output_path)
            result.file_path = output_path
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_video_models',
        'List available video generation models with their capabilities and pricing.',
        {},
        async () => {
          const models = Object.entries(VIDEO_MODELS).map(([key, model]) => ({
            id: key,
            name: model.name,
            description: model.description,
            cost: model.cost,
            params: Object.keys(model.params)
          }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ count: models.length, models }, null, 2)
            }]
          }
        }
      ),

      tool(
        'upscale',
        'Upscale images or videos using Topaz AI technology.',
        {
          type: z.enum(['image', 'video']).describe('Type of media to upscale'),
          media_url: z.string().describe('URL of the image or video to upscale'),
          output_path: z.string().optional().describe('File path to save upscaled media')
        },
        async ({ type, media_url, output_path }) => {
          const params = type === 'image'
            ? { image_url: media_url }
            : { video_url: media_url }

          const result = await upscaleMedia(type, params)

          if (output_path && result.file_path) {
            const dir = path.dirname(output_path)
            fs.mkdirSync(dir, { recursive: true })
            fs.copyFileSync(result.file_path, output_path)
            result.file_path = output_path
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        }
      )
    ]
  })
}
