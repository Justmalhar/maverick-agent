const parseList = (env) => env ? env.split(',').map(s => s.trim()).filter(Boolean) : []

export default {
  agentId: 'maverick-agent',

  whatsapp: {
    enabled: true,
    allowedDMs: parseList(process.env.WHATSAPP_ALLOWED_DMS),       // phone numbers, or '*' for all
    allowedGroups: parseList(process.env.WHATSAPP_ALLOWED_GROUPS),  // group JIDs
    respondToMentionsOnly: true
  },

  imessage: {
    enabled: false,
    allowedDMs: parseList(process.env.IMESSAGE_ALLOWED_DMS),       // chat IDs, or '*' for all
    allowedGroups: parseList(process.env.IMESSAGE_ALLOWED_GROUPS),
    respondToMentionsOnly: true
  },

  telegram: {
    enabled: true,
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedDMs: parseList(process.env.TELEGRAM_ALLOWED_DMS),       // user IDs, or '*' for all
    allowedGroups: parseList(process.env.TELEGRAM_ALLOWED_GROUPS),
    respondToMentionsOnly: true
  },

  // Agent configuration
  agent: {
    workspace: '~/maverick-agent',        // Agent workspace directory
    maxTurns: 100,                // Max tool-use turns per message
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    provider: 'claude',          // 'claude' or 'opencode'
    opencode: {
      model: 'opencode/gpt-5-nano',
      hostname: '127.0.0.1',
      port: 4097
    }
  },

  // Provider selections
  providers: {
    todo: process.env.TODO_PROVIDER || 'google',        // 'google' or 'microsoft'
    calendar: process.env.CALENDAR_PROVIDER || 'google', // 'google' or 'microsoft'
    tts: process.env.TTS_PROVIDER || 'elevenlabs',      // 'elevenlabs', 'fal', or 'replicate'
    stt: process.env.STT_PROVIDER || 'groq'             // 'groq', 'fal', or 'replicate'
  }
}
