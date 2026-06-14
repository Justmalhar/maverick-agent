/**
 * Context Summarization - Auto-compact long conversations
 * Uses the configured AI provider to summarize conversation history
 */

const DEFAULT_MAX_TOKENS = 100000
const DEFAULT_SUMMARY_THRESHOLD = 0.7 // Trigger at 70% context usage

/**
 * Summarize a conversation history
 * @param {Array} messages - Array of {role, content, timestamp} objects
 * @param {Object} options - Summarization options
 * @param {number} options.maxMessages - Max messages to keep detailed (default: 20)
 * @param {string} options.provider - AI provider to use for summarization
 * @returns {Promise<Object>} Summary result
 */
export async function summarizeConversation(messages, options = {}) {
  const {
    maxMessages = 20,
    provider = 'groq'
  } = options

  if (!messages || messages.length === 0) {
    return { summary: '', recentMessages: [], tokenEstimate: 0 }
  }

  // Keep recent messages detailed, summarize older ones
  const recentMessages = messages.slice(-maxMessages)
  const oldMessages = messages.slice(0, -maxMessages)

  if (oldMessages.length === 0) {
    // Nothing to summarize
    return {
      summary: null,
      recentMessages,
      tokenEstimate: estimateTokens(recentMessages)
    }
  }

  // Build context for summarization
  const conversationText = oldMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content || '[media]'}`)
    .join('\n\n')

  const summary = await generateSummary(conversationText, provider)

  return {
    summary,
    recentMessages,
    tokenEstimate: estimateTokens(recentMessages) + estimateTokens([{ content: summary }])
  }
}

/**
 * Generate a summary using AI provider
 */
async function generateSummary(text, provider) {
  // Use Groq if available (fastest), otherwise fall back to simple extraction
  if (process.env.GROQ_API_KEY) {
    return await summarizeWithGroq(text)
  }

  // Fallback: extract key points without AI
  return extractKeyPoints(text)
}

/**
 * Summarize using Groq API (fast, cheap)
 */
async function summarizeWithGroq(text) {
  const apiKey = process.env.GROQ_API_KEY

  const prompt = `Summarize the following conversation concisely. Focus on:
- Key decisions made
- Important information shared
- Action items or tasks mentioned
- Current topic/context
- Any preferences or constraints mentioned

Keep the summary under 500 words. Be factual, not conversational.

Conversation:
${text.substring(0, 50000)}` // Limit input size

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a concise summarizer. Extract key information from conversations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      console.error('[Summarization] Groq API error:', response.status)
      return extractKeyPoints(text)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || extractKeyPoints(text)
  } catch (err) {
    console.error('[Summarization] Error:', err.message)
    return extractKeyPoints(text)
  }
}

/**
 * Fallback: Extract key points without AI
 */
function extractKeyPoints(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const keyPoints = []

  // Extract user messages (likely contain important info)
  for (const line of lines) {
    if (line.startsWith('User:')) {
      const content = line.replace('User:', '').trim()
      if (content.length > 10 && content.length < 500) {
        keyPoints.push(content)
      }
    }
  }

  // Take last N key points
  const recent = keyPoints.slice(-10)

  return recent.length > 0
    ? `Previous conversation context:\n${recent.map(p => `- ${p}`).join('\n')}`
    : 'No significant prior context.'
}

/**
 * Estimate token count (rough: 1 token ≈ 4 chars)
 */
export function estimateTokens(messages) {
  const text = messages.map(m => m.content || '').join('')
  return Math.ceil(text.length / 4)
}

/**
 * Check if conversation needs summarization
 */
export function shouldSummarize(messages, maxTokens = DEFAULT_MAX_TOKENS) {
  const estimated = estimateTokens(messages)
  return estimated > maxTokens * DEFAULT_SUMMARY_THRESHOLD
}

/**
 * Build summarized context for agent
 */
export function buildSummarizedContext(summary, recentMessages) {
  const parts = []

  if (summary) {
    parts.push(`[Previous conversation summary]\n${summary}\n`)
  }

  parts.push('[Recent messages]')
  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant'
    parts.push(`${role}: ${msg.content || '[media]'}`)
  }

  return parts.join('\n\n')
}
