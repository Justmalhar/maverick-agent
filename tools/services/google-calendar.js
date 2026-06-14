import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

let accessToken = null
let tokenExpiry = 0

async function getAccessToken() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Calendar credentials not set (GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN)')
  }

  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Token refresh failed' }))
    throw new Error(`Token refresh failed: ${error.error || response.statusText}`)
  }

  const data = await response.json()
  accessToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return accessToken
}

async function calendarFetch(endpoint, options = {}) {
  const token = await getAccessToken()
  const url = endpoint.startsWith('http') ? endpoint : `${CALENDAR_API}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(`Google Calendar API error (${response.status}): ${error.error?.message || response.statusText}`)
  }

  if (response.status === 204) return null
  return response.json()
}

function formatEvent(event) {
  return {
    id: event.id,
    summary: event.summary || '(No title)',
    description: event.description || '',
    location: event.location || '',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    allDay: !event.start?.dateTime,
    status: event.status,
    recurring: !!event.recurringEventId,
    html_link: event.htmlLink,
    created: event.created,
    updated: event.updated
  }
}

export function createGoogleCalendarMcpServer() {
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
    console.log('[Calendar] Google Calendar credentials not set, calendar tools disabled')
    return null
  }

  console.log('[Calendar] Tools enabled')

  return createSdkMcpServer({
    name: 'calendar',
    version: '1.0.0',
    tools: [
      tool(
        'list_calendars',
        'List all calendars the user has access to',
        {},
        async () => {
          const data = await calendarFetch('/users/me/calendarList')
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.items.map(c => ({
                id: c.id,
                summary: c.summary,
                description: c.description || '',
                primary: c.primary,
                accessRole: c.accessRole,
                backgroundColor: c.backgroundColor,
                selected: c.selected
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'get_calendar',
        'Get details of a specific calendar',
        {
          calendar_id: z.string().describe('Calendar ID (use "primary" for the main calendar)')
        },
        async ({ calendar_id }) => {
          const calendar = await calendarFetch(`/calendars/${calendar_id}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: calendar.id,
                summary: calendar.summary,
                description: calendar.description || '',
                location: calendar.location || '',
                timeZone: calendar.timeZone
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_events',
        'List events from a calendar',
        {
          calendar_id: z.string().optional().describe('Calendar ID (default: primary)'),
          time_min: z.string().optional().describe('Start of time range (RFC 3339, e.g., 2024-01-01T00:00:00Z)'),
          time_max: z.string().optional().describe('End of time range (RFC 3339)'),
          max_results: z.number().optional().describe('Max results (default 25)'),
          query: z.string().optional().describe('Free text search query'),
          single_events: z.boolean().optional().describe('Expand recurring events (default true)'),
          order_by: z.enum(['startTime', 'updated']).optional().describe('Order by start time or last updated')
        },
        async ({ calendar_id, time_min, time_max, max_results, query, single_events, order_by }) => {
          const params = new URLSearchParams()
          params.set('singleEvents', single_events !== false ? 'true' : 'false')
          params.set('maxResults', (max_results || 25).toString())
          if (time_min) params.set('timeMin', time_min)
          if (time_max) params.set('timeMax', time_max)
          if (query) params.set('q', query)
          if (order_by) params.set('orderBy', order_by)

          const data = await calendarFetch(`/calendars/${calendar_id || 'primary'}/events?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.items?.map(formatEvent) || [], null, 2)
            }]
          }
        }
      ),

      tool(
        'get_event',
        'Get details of a specific event',
        {
          calendar_id: z.string().optional().describe('Calendar ID (default: primary)'),
          event_id: z.string().describe('Event ID')
        },
        async ({ calendar_id, event_id }) => {
          const event = await calendarFetch(`/calendars/${calendar_id || 'primary'}/events/${event_id}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(formatEvent(event), null, 2)
            }]
          }
        }
      ),

      tool(
        'create_event',
        'Create a new calendar event',
        {
          calendar_id: z.string().optional().describe('Calendar ID (default: primary)'),
          summary: z.string().describe('Event title'),
          description: z.string().optional().describe('Event description'),
          location: z.string().optional().describe('Event location'),
          start: z.string().describe('Start time (RFC 3339, e.g., 2024-12-25T10:00:00)'),
          end: z.string().describe('End time (RFC 3339)'),
          all_day: z.boolean().optional().describe('Is this an all-day event?'),
          attendees: z.array(z.string()).optional().describe('Array of attendee emails'),
          recurrence: z.array(z.string()).optional().describe('RRULE recurrence rules'),
          reminders: z.object({
            use_default: z.boolean().optional(),
            overrides: z.array(z.object({
              method: z.enum(['email', 'popup']),
              minutes: z.number()
            })).optional()
          }).optional().describe('Reminder settings'),
          visibility: z.enum(['default', 'public', 'private']).optional().describe('Event visibility'),
          color_id: z.string().optional().describe('Event color ID')
        },
        async ({ calendar_id, summary, description, location, start, end, all_day, attendees, recurrence, reminders, visibility, color_id }) => {
          const event = {
            summary,
            start: all_day ? { date: start.split('T')[0] } : { dateTime: start },
            end: all_day ? { date: end.split('T')[0] } : { dateTime: end }
          }

          if (description) event.description = description
          if (location) event.location = location
          if (attendees) event.attendees = attendees.map(email => ({ email }))
          if (recurrence) event.recurrence = recurrence
          if (reminders) event.reminders = reminders
          if (visibility) event.visibility = visibility
          if (color_id) event.colorId = color_id

          const result = await calendarFetch(`/calendars/${calendar_id || 'primary'}/events`, {
            method: 'POST',
            body: JSON.stringify(event)
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...formatEvent(result)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'update_event',
        'Update an existing calendar event',
        {
          calendar_id: z.string().optional().describe('Calendar ID (default: primary)'),
          event_id: z.string().describe('Event ID'),
          summary: z.string().optional().describe('New title'),
          description: z.string().optional().describe('New description'),
          location: z.string().optional().describe('New location'),
          start: z.string().optional().describe('New start time (RFC 3339)'),
          end: z.string().optional().describe('New end time (RFC 3339)'),
          all_day: z.boolean().optional().describe('Is this an all-day event?')
        },
        async ({ calendar_id, event_id, summary, description, location, start, end, all_day }) => {
          const existing = await calendarFetch(`/calendars/${calendar_id || 'primary'}/events/${event_id}`)

          const updates = { ...existing }
          if (summary) updates.summary = summary
          if (description !== undefined) updates.description = description
          if (location !== undefined) updates.location = location
          if (start) updates.start = all_day ? { date: start.split('T')[0] } : { dateTime: start }
          if (end) updates.end = all_day ? { date: end.split('T')[0] } : { dateTime: end }

          const result = await calendarFetch(`/calendars/${calendar_id || 'primary'}/events/${event_id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...formatEvent(result)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'delete_event',
        'Delete a calendar event',
        {
          calendar_id: z.string().optional().describe('Calendar ID (default: primary)'),
          event_id: z.string().describe('Event ID')
        },
        async ({ calendar_id, event_id }) => {
          await calendarFetch(`/calendars/${calendar_id || 'primary'}/events/${event_id}`, {
            method: 'DELETE'
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Event deleted' }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_todays_events',
        'Get all events for today',
        {
          calendar_id: z.string().optional().describe('Calendar ID (default: primary)')
        },
        async ({ calendar_id }) => {
          const now = new Date()
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
          const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

          const params = new URLSearchParams({
            timeMin: startOfDay,
            timeMax: endOfDay,
            singleEvents: 'true',
            orderBy: 'startTime'
          })

          const data = await calendarFetch(`/calendars/${calendar_id || 'primary'}/events?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                date: now.toISOString().split('T')[0],
                event_count: data.items?.length || 0,
                events: data.items?.map(formatEvent) || []
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_upcoming_events',
        'Get upcoming events for the next N days',
        {
          calendar_id: z.string().optional().describe('Calendar ID (default: primary)'),
          days: z.number().optional().describe('Number of days ahead (default: 7)')
        },
        async ({ calendar_id, days }) => {
          const now = new Date()
          const future = new Date(now.getTime() + (days || 7) * 24 * 60 * 60 * 1000)

          const params = new URLSearchParams({
            timeMin: now.toISOString(),
            timeMax: future.toISOString(),
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '50'
          })

          const data = await calendarFetch(`/calendars/${calendar_id || 'primary'}/events?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                period: `${days || 7} days`,
                event_count: data.items?.length || 0,
                events: data.items?.map(formatEvent) || []
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'quick_add_event',
        'Quick add an event using natural language (e.g., "Meeting with John tomorrow at 3pm")',
        {
          calendar_id: z.string().optional().describe('Calendar ID (default: primary)'),
          text: z.string().describe('Natural language event description'),
          date: z.string().optional().describe('Date context (YYYY-MM-DD) if not in text')
        },
        async ({ calendar_id, text, date }) => {
          const params = new URLSearchParams({ text })
          if (date) params.set('date', date)

          const result = await calendarFetch(`/calendars/${calendar_id || 'primary'}/events/quickAdd`, {
            method: 'POST',
            body: JSON.stringify({ text, date })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...formatEvent(result)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_event_colors',
        'List available event colors',
        {},
        async () => {
          const data = await calendarFetch('/colors')
          const colors = Object.entries(data.event || {}).map(([id, color]) => ({
            id,
            name: color.name,
            background: color.background,
            foreground: color.foreground
          }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(colors, null, 2)
            }]
          }
        }
      )
    ]
  })
}
