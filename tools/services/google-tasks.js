import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1'

let accessToken = null
let tokenExpiry = 0

async function getAccessToken() {
  const clientId = process.env.GOOGLE_TASKS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_TASKS_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_TASKS_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Tasks credentials not set (GOOGLE_TASKS_CLIENT_ID, GOOGLE_TASKS_CLIENT_SECRET, GOOGLE_TASKS_REFRESH_TOKEN)')
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

async function tasksFetch(endpoint, options = {}) {
  const token = await getAccessToken()
  const url = endpoint.startsWith('http') ? endpoint : `${TASKS_API}${endpoint}`

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
    throw new Error(`Google Tasks API error (${response.status}): ${error.error?.message || response.statusText}`)
  }

  if (response.status === 204) return null
  return response.json()
}

function formatTask(task) {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes || '',
    due: task.due || null,
    completed: task.completed || null,
    status: task.status,
    position: task.position,
    updated: task.updated,
    self_link: task.selfLink
  }
}

export function createGoogleTasksMcpServer() {
  if (!process.env.GOOGLE_TASKS_CLIENT_ID || !process.env.GOOGLE_TASKS_REFRESH_TOKEN) {
    console.log('[Tasks] Google Tasks credentials not set, tasks tools disabled')
    return null
  }

  console.log('[Tasks] Tools enabled')

  return createSdkMcpServer({
    name: 'tasks',
    version: '1.0.0',
    tools: [
      tool(
        'list_task_lists',
        'List all task lists',
        {},
        async () => {
          const data = await tasksFetch('/users/@me/lists')
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.items?.map(l => ({
                id: l.id,
                title: l.title,
                updated: l.updated
              })) || [], null, 2)
            }]
          }
        }
      ),

      tool(
        'get_task_list',
        'Get details of a specific task list',
        {
          task_list_id: z.string().describe('Task list ID (use @default for the default list)')
        },
        async ({ task_list_id }) => {
          const list = await tasksFetch(`/users/@me/lists/${task_list_id}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: list.id,
                title: list.title,
                updated: list.updated
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'create_task_list',
        'Create a new task list',
        {
          title: z.string().describe('Task list title')
        },
        async ({ title }) => {
          const list = await tasksFetch('/users/@me/lists', {
            method: 'POST',
            body: JSON.stringify({ title })
          })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                id: list.id,
                title: list.title
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'update_task_list',
        'Update a task list title',
        {
          task_list_id: z.string().describe('Task list ID'),
          title: z.string().describe('New title')
        },
        async ({ task_list_id, title }) => {
          const list = await tasksFetch(`/users/@me/lists/${task_list_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ title })
          })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                id: list.id,
                title: list.title
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'delete_task_list',
        'Delete a task list',
        {
          task_list_id: z.string().describe('Task list ID')
        },
        async ({ task_list_id }) => {
          await tasksFetch(`/users/@me/lists/${task_list_id}`, {
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
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)'),
          show_completed: z.boolean().optional().describe('Include completed tasks (default: false)'),
          show_hidden: z.boolean().optional().describe('Include hidden tasks (default: false)'),
          due_min: z.string().optional().describe('Lower bound for due date (RFC 3339)'),
          due_max: z.string().optional().describe('Upper bound for due date (RFC 3339)')
        },
        async ({ task_list_id, show_completed, show_hidden, due_min, due_max }) => {
          const listId = task_list_id || '@default'
          const params = new URLSearchParams()
          if (show_completed !== undefined) params.set('showCompleted', show_completed.toString())
          if (show_hidden !== undefined) params.set('showHidden', show_hidden.toString())
          if (due_min) params.set('dueMin', due_min)
          if (due_max) params.set('dueMax', due_max)

          const data = await tasksFetch(`/lists/${listId}/tasks?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.items?.map(formatTask) || [], null, 2)
            }]
          }
        }
      ),

      tool(
        'get_task',
        'Get details of a specific task',
        {
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)'),
          task_id: z.string().describe('Task ID')
        },
        async ({ task_list_id, task_id }) => {
          const listId = task_list_id || '@default'
          const task = await tasksFetch(`/lists/${listId}/tasks/${task_id}`)
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
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)'),
          title: z.string().describe('Task title'),
          notes: z.string().optional().describe('Task notes/description'),
          due: z.string().optional().describe('Due date (RFC 3339, e.g., 2024-12-25T00:00:00Z)')
        },
        async ({ task_list_id, title, notes, due }) => {
          const listId = task_list_id || '@default'
          const task = { title }
          if (notes) task.notes = notes
          if (due) task.due = due

          const result = await tasksFetch(`/lists/${listId}/tasks`, {
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
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)'),
          task_id: z.string().describe('Task ID'),
          title: z.string().optional().describe('New title'),
          notes: z.string().optional().describe('New notes'),
          due: z.string().optional().describe('New due date (RFC 3339)'),
          status: z.enum(['needsAction', 'completed']).optional().describe('Task status')
        },
        async ({ task_list_id, task_id, title, notes, due, status }) => {
          const listId = task_list_id || '@default'

          const existing = await tasksFetch(`/lists/${listId}/tasks/${task_id}`)
          const updates = {
            title: title || existing.title,
            notes: notes !== undefined ? notes : existing.notes,
            due: due !== undefined ? due : existing.due,
            status: status || existing.status
          }

          const result = await tasksFetch(`/lists/${listId}/tasks/${task_id}`, {
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
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)'),
          task_id: z.string().describe('Task ID')
        },
        async ({ task_list_id, task_id }) => {
          const listId = task_list_id || '@default'
          const result = await tasksFetch(`/lists/${listId}/tasks/${task_id}`, {
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
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)'),
          task_id: z.string().describe('Task ID')
        },
        async ({ task_list_id, task_id }) => {
          const listId = task_list_id || '@default'
          const result = await tasksFetch(`/lists/${listId}/tasks/${task_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'needsAction', completed: null })
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
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)'),
          task_id: z.string().describe('Task ID')
        },
        async ({ task_list_id, task_id }) => {
          const listId = task_list_id || '@default'
          await tasksFetch(`/lists/${listId}/tasks/${task_id}`, {
            method: 'DELETE'
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Task deleted' }, null, 2)
            }]
          }
        }
      ),

      tool(
        'clear_completed',
        'Clear all completed tasks from a task list',
        {
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)')
        },
        async ({ task_list_id }) => {
          const listId = task_list_id || '@default'
          const result = await tasksFetch(`/lists/${listId}/clear`, {
            method: 'POST'
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Completed tasks cleared' }, null, 2)
            }]
          }
        }
      ),

      tool(
        'move_task',
        'Move a task to a new position or list',
        {
          task_list_id: z.string().optional().describe('Task list ID (defaults to @default)'),
          task_id: z.string().describe('Task ID'),
          parent: z.string().optional().describe('Parent task ID (for subtasks)'),
          previous: z.string().optional().describe('Task ID to place after')
        },
        async ({ task_list_id, task_id, parent, previous }) => {
          const listId = task_list_id || '@default'
          const params = new URLSearchParams()
          if (parent) params.set('parent', parent)
          if (previous) params.set('previous', previous)

          const result = await tasksFetch(`/lists/${listId}/tasks/${task_id}/move?${params}`, {
            method: 'POST'
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Task moved',
                ...formatTask(result)
              }, null, 2)
            }]
          }
        }
      )
    ]
  })
}
