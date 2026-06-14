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
      scope: 'Tasks.ReadWrite offline_access'
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
    throw new Error(`Microsoft Graph API error (${response.status}): ${error.error?.message || response.error_description || response.statusText}`)
  }

  if (response.status === 204) return null
  return response.json()
}

function formatTaskList(list) {
  return {
    id: list.id,
    name: list.displayName,
    isShared: list.isShared,
    isWellKnownList: list.isWellKnownList,
    created: list.createdDateTime,
    lastModified: list.lastModifiedDateTime
  }
}

function formatTask(task) {
  return {
    id: task.id,
    title: task.title,
    note: task.body?.content || '',
    status: task.status,
    importance: task.importance,
    due: task.dueDateTime?.dateTime || null,
    completed: task.completedDateTime?.dateTime || null,
    created: task.createdDateTime,
    lastModified: task.lastModifiedDateTime
  }
}

export function createMicrosoftTodoMcpServer() {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_REFRESH_TOKEN) {
    console.log('[Microsoft Todo] Credentials not set, Microsoft Todo tools disabled')
    return null
  }

  console.log('[Microsoft Todo] Tools enabled')

  return createSdkMcpServer({
    name: 'microsoft-todo',
    version: '1.0.0',
    tools: [
      tool(
        'list_task_lists',
        'List all task lists (folders)',
        {},
        async () => {
          const data = await graphFetch('/me/todo/lists')
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.value?.map(formatTaskList) || [], null, 2)
            }]
          }
        }
      ),

      tool(
        'get_task_list',
        'Get details of a specific task list',
        {
          list_id: z.string().describe('Task list ID')
        },
        async ({ list_id }) => {
          const list = await graphFetch(`/me/todo/lists/${list_id}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(formatTaskList(list), null, 2)
            }]
          }
        }
      ),

      tool(
        'create_task_list',
        'Create a new task list',
        {
          name: z.string().describe('Task list name')
        },
        async ({ name }) => {
          const list = await graphFetch('/me/todo/lists', {
            method: 'POST',
            body: JSON.stringify({ displayName: name })
          })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...formatTaskList(list)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'update_task_list',
        'Rename a task list',
        {
          list_id: z.string().describe('Task list ID'),
          name: z.string().describe('New name')
        },
        async ({ list_id, name }) => {
          const list = await graphFetch(`/me/todo/lists/${list_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ displayName: name })
          })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...formatTaskList(list)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'delete_task_list',
        'Delete a task list',
        {
          list_id: z.string().describe('Task list ID')
        },
        async ({ list_id }) => {
          await graphFetch(`/me/todo/lists/${list_id}`, {
            method: 'DELETE'
          })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Task list deleted' }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_tasks',
        'List tasks in a task list',
        {
          list_id: z.string().describe('Task list ID'),
          filter: z.string().optional().describe('Filter expression (e.g., status eq \'completed\')'),
          top: z.number().optional().describe('Max results (default 50)')
        },
        async ({ list_id, filter, top }) => {
          const params = new URLSearchParams()
          if (filter) params.set('$filter', filter)
          if (top) params.set('$top', top.toString())

          const data = await graphFetch(`/me/todo/lists/${list_id}/tasks?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.value?.map(formatTask) || [], null, 2)
            }]
          }
        }
      ),

      tool(
        'get_task',
        'Get details of a specific task',
        {
          list_id: z.string().describe('Task list ID'),
          task_id: z.string().describe('Task ID')
        },
        async ({ list_id, task_id }) => {
          const task = await graphFetch(`/me/todo/lists/${list_id}/tasks/${task_id}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(formatTask(task), null, 2)
            }]
          }
        }
      ),

      tool(
        'create_task',
        'Create a new task',
        {
          list_id: z.string().describe('Task list ID'),
          title: z.string().describe('Task title'),
          note: z.string().optional().describe('Task notes'),
          due: z.string().optional().describe('Due date (ISO 8601 format)'),
          importance: z.enum(['low', 'normal', 'high']).optional().describe('Task importance')
        },
        async ({ list_id, title, note, due, importance }) => {
          const task = { title }
          if (note) task.body = { content: note, contentType: 'text' }
          if (due) task.dueDateTime = { dateTime: due, timeZone: 'UTC' }
          if (importance) task.importance = importance

          const result = await graphFetch(`/me/todo/lists/${list_id}/tasks`, {
            method: 'POST',
            body: JSON.stringify(task)
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...formatTask(result)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'update_task',
        'Update an existing task',
        {
          list_id: z.string().describe('Task list ID'),
          task_id: z.string().describe('Task ID'),
          title: z.string().optional().describe('New title'),
          note: z.string().optional().describe('New notes'),
          due: z.string().optional().describe('New due date (ISO 8601)'),
          importance: z.enum(['low', 'normal', 'high']).optional().describe('New importance')
        },
        async ({ list_id, task_id, title, note, due, importance }) => {
          const updates = {}
          if (title) updates.title = title
          if (note !== undefined) updates.body = { content: note, contentType: 'text' }
          if (due !== undefined) updates.dueDateTime = due ? { dateTime: due, timeZone: 'UTC' } : null
          if (importance) updates.importance = importance

          const result = await graphFetch(`/me/todo/lists/${list_id}/tasks/${task_id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...formatTask(result)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'complete_task',
        'Mark a task as completed',
        {
          list_id: z.string().describe('Task list ID'),
          task_id: z.string().describe('Task ID')
        },
        async ({ list_id, task_id }) => {
          const result = await graphFetch(`/me/todo/lists/${list_id}/tasks/${task_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'completed' })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Task marked as completed',
                ...formatTask(result)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'uncomplete_task',
        'Mark a completed task as not done',
        {
          list_id: z.string().describe('Task list ID'),
          task_id: z.string().describe('Task ID')
        },
        async ({ list_id, task_id }) => {
          const result = await graphFetch(`/me/todo/lists/${list_id}/tasks/${task_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'notStarted' })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Task marked as incomplete',
                ...formatTask(result)
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'delete_task',
        'Delete a task',
        {
          list_id: z.string().describe('Task list ID'),
          task_id: z.string().describe('Task ID')
        },
        async ({ list_id, task_id }) => {
          await graphFetch(`/me/todo/lists/${list_id}/tasks/${task_id}`, {
            method: 'DELETE'
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Task deleted' }, null, 2)
            }]
          }
        }
      )
    ]
  })
}
