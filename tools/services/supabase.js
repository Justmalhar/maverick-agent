import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

function getAnonHeaders() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set')
  return {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    baseUrl: url
  }
}

function getServiceHeaders() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  return {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    baseUrl: url
  }
}

function buildFilterParams(filters) {
  if (!filters) return ''
  const params = []
  for (const [column, value] of Object.entries(filters)) {
    if (typeof value === 'object' && value !== null) {
      if (value.op && value.value !== undefined) {
        params.push(`${column}=${value.op}.${value.value}`)
      } else {
        for (const [op, val] of Object.entries(value)) {
          params.push(`${column}=${op}.${val}`)
        }
      }
    } else {
      params.push(`${column}=eq.${value}`)
    }
  }
  return params.length ? `?${params.join('&')}` : ''
}

export function createSupabaseMcpServer() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('[Supabase] SUPABASE_URL or SUPABASE_ANON_KEY not set, Supabase tools disabled')
    return null
  }

  console.log('[Supabase] Tools enabled')

  return createSdkMcpServer({
    name: 'supabase',
    version: '1.0.0',
    tools: [
      tool(
        'list_tables',
        'List all tables in the database using information_schema',
        {},
        async () => {
          const { headers, baseUrl } = getAnonHeaders()
          const res = await fetch(
            `${baseUrl}/rest/v1/?select=*&limit=0`,
            { headers }
          )
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Failed to list tables: ${res.status} ${err}`)
          }
          const tables = await res.json()
          return {
            content: [{ type: 'text', text: JSON.stringify(tables, null, 2) }]
          }
        }
      ),

      tool(
        'query_table',
        'Query a table with optional filters using PostgREST',
        {
          table: z.string().describe('Table name to query'),
          columns: z.string().optional().describe('Comma-separated column names (default: *)'),
          filters: z.record(z.union([z.string(), z.number(), z.boolean(), z.object({ op: z.string(), value: z.union([z.string(), z.number()]) })])).optional().describe('Filter conditions as { column: value } for equality or { column: { op: value } } for operators (eq, neq, gt, lt, gte, lte, like, ilike, in, is)'),
          order: z.string().optional().describe('Order by column, prefix with - for desc (e.g. "-created_at")'),
          limit: z.number().optional().describe('Max rows to return'),
          offset: z.number().optional().describe('Number of rows to skip')
        },
        async ({ table, columns, filters, order, limit, offset }) => {
          const { headers, baseUrl } = getAnonHeaders()
          let query = `?select=${columns || '*'}`
          query += buildFilterParams(filters)
          if (order) query += `&order=${order}`
          if (limit) query += `&limit=${limit}`
          if (offset) query += `&offset=${offset}`

          const res = await fetch(`${baseUrl}/rest/v1/${table}${query}`, {
            headers: { ...headers, Prefer: 'return=representation' }
          })
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Query failed: ${res.status} ${err}`)
          }
          const data = await res.json()
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          }
        }
      ),

      tool(
        'insert_rows',
        'Insert rows into a table',
        {
          table: z.string().describe('Table name to insert into'),
          rows: z.array(z.record(z.any())).describe('Array of row objects to insert'),
          upsert: z.boolean().optional().describe('Use upsert instead of insert (default: false)')
        },
        async ({ table, rows, upsert }) => {
          const { headers, baseUrl } = getAnonHeaders()
          const res = await fetch(`${baseUrl}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
              ...headers,
              Prefer: upsert ? 'return=representation,resolution=merge-duplicates' : 'return=representation'
            },
            body: JSON.stringify(rows.length === 1 ? rows[0] : rows)
          })
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Insert failed: ${res.status} ${err}`)
          }
          const data = await res.json()
          return {
            content: [{ type: 'text', text: JSON.stringify({ inserted: Array.isArray(data) ? data.length : 1, rows: data }, null, 2) }]
          }
        }
      ),

      tool(
        'update_rows',
        'Update rows in a table with filters',
        {
          table: z.string().describe('Table name to update'),
          data: z.record(z.any()).describe('Object of column:value pairs to set'),
          filters: z.record(z.union([z.string(), z.number(), z.boolean(), z.object({ op: z.string(), value: z.union([z.string(), z.number()]) })])).describe('Filter conditions to match rows to update')
        },
        async ({ table, data, filters }) => {
          const { headers, baseUrl } = getAnonHeaders()
          const query = buildFilterParams(filters)

          const res = await fetch(`${baseUrl}/rest/v1/${table}${query}`, {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=representation' },
            body: JSON.stringify(data)
          })
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Update failed: ${res.status} ${err}`)
          }
          const result = await res.json()
          return {
            content: [{ type: 'text', text: JSON.stringify({ updated: Array.isArray(result) ? result.length : 1, rows: result }, null, 2) }]
          }
        }
      ),

      tool(
        'delete_rows',
        'Delete rows from a table with filters',
        {
          table: z.string().describe('Table name to delete from'),
          filters: z.record(z.union([z.string(), z.number(), z.boolean(), z.object({ op: z.string(), value: z.union([z.string(), z.number()]) })])).describe('Filter conditions to match rows to delete')
        },
        async ({ table, filters }) => {
          const { headers, baseUrl } = getAnonHeaders()
          const query = buildFilterParams(filters)

          const res = await fetch(`${baseUrl}/rest/v1/${table}${query}`, {
            method: 'DELETE',
            headers: { ...headers, Prefer: 'return=representation' }
          })
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Delete failed: ${res.status} ${err}`)
          }
          const result = await res.json()
          return {
            content: [{ type: 'text', text: JSON.stringify({ deleted: Array.isArray(result) ? result.length : 1, rows: result }, null, 2) }]
          }
        }
      ),

      tool(
        'execute_sql',
        'Execute raw SQL query (uses service role key - use with caution)',
        {
          query: z.string().describe('SQL query to execute')
        },
        async ({ query: sql }) => {
          const { headers, baseUrl } = getServiceHeaders()
          const res = await fetch(`${baseUrl}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'return=representation' },
            body: JSON.stringify({ query: sql })
          })

          if (res.ok) {
            const data = await res.json()
            return {
              content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
            }
          }

          const fallbackRes = await fetch(`${baseUrl}/sql`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'return=representation' },
            body: sql
          })
          if (!fallbackRes.ok) {
            const err = await fallbackRes.text()
            throw new Error(`SQL execution failed: ${fallbackRes.status} ${err}`)
          }
          const fallbackData = await fallbackRes.json()
          return {
            content: [{ type: 'text', text: JSON.stringify(fallbackData, null, 2) }]
          }
        }
      ),

      tool(
        'list_storage_buckets',
        'List all storage buckets',
        {},
        async () => {
          const { headers, baseUrl } = getAnonHeaders()
          const res = await fetch(`${baseUrl}/storage/v1/bucket`, {
            headers
          })
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Failed to list buckets: ${res.status} ${err}`)
          }
          const data = await res.json()
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          }
        }
      ),

      tool(
        'list_storage_files',
        'List files in a storage bucket',
        {
          bucket: z.string().describe('Bucket name'),
          path: z.string().optional().describe('Path prefix to filter files'),
          limit: z.number().optional().describe('Max files to return'),
          offset: z.number().optional().describe('Number of files to skip')
        },
        async ({ bucket, path, limit, offset }) => {
          const { headers, baseUrl } = getAnonHeaders()
          const body = {
            prefix: path || '',
            limit: limit || 100,
            offset: offset || 0,
            sortBy: { column: 'name', order: 'asc' }
          }

          const res = await fetch(`${baseUrl}/storage/v1/object/list/${bucket}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
          })
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Failed to list files: ${res.status} ${err}`)
          }
          const data = await res.json()
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
          }
        }
      ),

      tool(
        'upload_file',
        'Upload a file to storage',
        {
          bucket: z.string().describe('Bucket name'),
          path: z.string().describe('File path in the bucket (e.g. "folder/file.txt")'),
          content: z.string().describe('File content (text or base64-encoded for binary)'),
          contentType: z.string().optional().describe('MIME type (e.g. "text/plain", "image/png")'),
          upsert: z.boolean().optional().describe('Overwrite existing file (default: false)')
        },
        async ({ bucket, path, content, contentType, upsert }) => {
          const { headers, baseUrl } = getAnonHeaders()
          const cleanPath = path.startsWith('/') ? path.slice(1) : path

          const res = await fetch(
            `${baseUrl}/storage/v1/object/${bucket}/${cleanPath}`,
            {
              method: 'POST',
              headers: {
                ...headers,
                'Content-Type': contentType || 'text/plain',
                'x-upsert': upsert ? 'true' : 'false'
              },
              body: content
            }
          )
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Upload failed: ${res.status} ${err}`)
          }
          const data = await res.json()
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, key: data.Key || `${bucket}/${cleanPath}` }, null, 2) }]
          }
        }
      ),

      tool(
        'get_table_schema',
        'Get detailed schema for a table',
        {
          table: z.string().describe('Table name to get schema for')
        },
        async ({ table }) => {
          const { headers, baseUrl } = getAnonHeaders()
          const res = await fetch(
            `${baseUrl}/rest/v1/${table}?limit=0`,
            {
              headers: {
                ...headers,
                Prefer: 'count=exact, representation=canonical'
              }
            }
          )
          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Failed to get schema: ${res.status} ${err}`)
          }

          const metaRes = await fetch(
            `${baseUrl}/rest/v1/`,
            { headers }
          )

          const schemaInfo = {
            table,
            headers: res.headers.get('Content-Range') || 'N/A',
            available: true
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(schemaInfo, null, 2) }]
          }
        }
      )
    ]
  })
}
