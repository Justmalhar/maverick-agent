import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const GRAPH_API = 'https://graph.microsoft.com/v1.0'

let accessToken = null
let tokenExpiry = 0

async function getAccessToken() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const refreshToken = process.env.MICROSOFT_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Microsoft credentials not set (MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REFRESH_TOKEN)')
  }

  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken
  }

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'Calendars.ReadWrite offline_access'
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Token refresh failed' }))
    throw new Error(`Token refresh failed: ${error.error || response.error_description || response.statusText}`)
  }

  const data = await response.json()
  accessToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return accessToken
}

async function graphFetch(endpoint, options = {}) {
  const token = await getAccessToken()
  const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_API}${endpoint}`

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
    throw new Error(`Microsoft Graph API error (${response.status}): ${error.error?.message || error.error_description || response.statusText}`)
  }

  if (response.status === 204) return null
  return response.json()
}

function formatEvent(event) {
  return {
    id: event.id,
    subject: event.subject || '(No title)',
    body: event.body?.content || '',
    location: event.location?.displayName || '',
    start: event.start?.dateTime,
    end: event.end?.dateTime,
    isAllDay: event.isAllDayEvent,
    status: event.showAs,
    importance: event.importance,
    isRecurring: !!event.seriesMasterId,
    webLink: event.webLink,
    created: event.createdDateTime,
    lastModified: event.lastModifiedDateTime
  }
}

export function createMicrosoftCalendarMcpServer() {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_REFRESH_TOKEN) {
    console.log('[Microsoft Calendar] Credentials not set, Microsoft Calendar tools disabled')
    return null
  }

  console.log('[Microsoft Calendar] Tools enabled')

  return createSdkMcpServer({
    name: 'microsoft-calendar',
    version: '1.0.0',
    tools: [
      tool(
        'list_calendars',
        'List all calendars',
        {},
        async () => {
          const data = await graphFetch('/me/calendars')
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.value?.map(c => ({
                id: c.id,
                name: c.name,
                color: c.color,
                isDefaultCalendar: c.isDefaultCalendar,
                canShare: c.canShare,
                canEdit: c.canEdit
              })) || [], null, 2)
            }]
          }
        }
      ),

      tool(
        'get_calendar',
        'Get details of a specific calendar',
        {
          calendar_id: z.string().describe('Calendar ID (use "primary" for main calendar)')
        },
        async ({ calendar_id }) => {
          const id = calendar_id === 'primary' ? 'calendar' : `calendars/${calendar_id}`
          const calendar = await graphFetch(`/me/${id}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: calendar.id,
                name: calendar.name,
                color: calendar.color,
                isDefaultCalendar: calendar.isDefaultCalendar
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
          start_datetime: z.string().optional().describe('Start of time range (ISO 8601)'),
          end_datetime: z.string().optional().describe('End of time range (ISO 8601)'),
          top: z.number().optional().describe('Max results (default 25)'),
          search: z.string().optional().describe('Search query for subject/body')
        },
        async ({ calendar_id, start_datetime, end_datetime, top, search }) => {
          const start = start_datetime || new Date().toISOString()
          const end = end_datetime || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

          const filter = `start/dateTime ge '${start}' and end/dateTime le '${end}'`
          const params = new URLSearchParams({
            '$filter': filter,
            '$orderby': 'start/dateTime',
            '$top': (top || 25).toString()
          })
          if (search) params.set('$search', `"${search}"`)

          const id = calendar_id === 'primary' || !calendar_id ? 'calendar' : `calendars/${calendar_id}`
          const data = await graphFetch(`/me/${id}/events?${params}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.value?.map(formatEvent) || [], null, 2)
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
          const id = calendar_id === 'primary' || !calendar_id ? 'calendar' : `calendars/${calendar_id}`
          const event = await graphFetch(`/me/${id}/events/${event_id}`)
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
          subject: z.string().describe('Event title'),
          body: z.string().optional().describe('Event description'),
          location: z.string().optional().describe('Event location'),
          start: z.string().describe('Start time (ISO 8601)'),
          end: z.string().describe('End time (ISO 8601)'),
          is_all_day: z.boolean().optional().describe('Is this an all-day event?'),
          attendees: z.array(z.string()).optional().describe('Array of attendee emails'),
          importance: z.enum(['low', 'normal', 'high']).optional().describe('Event importance'),
          show_as: z.enum(['free', 'tentative', 'busy', 'oof', 'workingElsewhere']).optional().describe('Show as status')
        },
        async ({ calendar_id, subject, body, location, start, end, is_all_day, attendees, importance, show_as }) => {
          const event = {
            subject,
            start: { dateTime: start, timeZone: 'UTC' },
            end: { dateTime: end, timeZone: 'UTC' },
            isAllDayEvent: is_all_day || false
          }

          if (body) event.body = { content: body, contentType: 'text' }
          if (location) event.location = { displayName: location }
          if (attendees) event.attendees = attendees.map(email => ({
            emailAddress: { address: email },
            type: 'required'
          }))
          if (importance) event.importance = importance
          if (show_as) event.showAs = show_as

          const id = calendar_id === 'primary' || !calendar_id ? 'calendar' : `calendars/${calendar_id}`
          const result = await graphFetch(`/me/${id}/events`, {
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
          subject: z.string().optional().describe('New title'),
          body: z.string().optional().describe('New description'),
          location: z.string().optional().describe('New location'),
          start: z.string().optional().describe('New start time (ISO 8601)'),
          end: z.string().optional().describe('New end time (ISO 8601)')
        },
        async ({ calendar_id, event_id, subject, body, location, start, end }) => {
          const updates = {}
          if (subject) updates.subject = subject
          if (body !== undefined) updates.body = { content: body, contentType: 'text' }
          if (location !== undefined) updates.location = { displayName: location }
          if (start) updates.start = { dateTime: start, timeZone: 'UTC' }
          if (end) updates.end = { dateTime: end, timeZone: 'UTC' }

          const id = calendar_id === 'primary' || !calendar_id ? 'calendar' : `calendars/${calendar_id}`
          const result = await graphFetch(`/me/${id}/events/${event_id}`, {
            method: 'PATCH',
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
          const id = calendar_id === 'primary' || !calendar_id ? 'calendar' : `calendars/${calendar_id}`
          await graphFetch(`/me/${id}/events/${event_id}`, {
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

          const id = calendar_id === 'primary' || !calendar_id ? 'calendar' : `calendars/${calendar_id}`
          const data = await graphFetch(`/me/${id}/events?$filter=start/dateTime ge '${startOfDay}' and end/dateTime le '${endOfDay}'&$orderby=start/dateTime`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                date: now.toISOString().split('T')[0],
                event_count: data.value?.length || 0,
                events: data.value?.map(formatEvent) || []
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
          days: z.number().optional().describe('Number of days ahead (default 7)')
        },
        async ({ calendar_id, days }) => {
          const now = new Date()
          const future = new Date(now.getTime() + (days || 7) * 24 * 60 * 60 * 1000)

          const id = calendar_id === 'primary' || !calendar_id ? 'calendar' : `calendars/${calendar_id}`
          const data = await graphFetch(`/me/${id}/events?$filter=start/dateTime ge '${now.toISOString()}' and end/dateTime le '${future.toISOString()}'&$orderby=start/dateTime&$top=50`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                period: `${days || 7} days`,
                event_count: data.value?.length || 0,
                events: data.value?.map(formatEvent) || []
              }, null, 2)
            }]
          }
        }
      )
    ]
  })
}
