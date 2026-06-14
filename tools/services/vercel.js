import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const VERCEL_API = 'https://api.vercel.com'

function getHeaders() {
  const token = process.env.VERCEL_TOKEN
  if (!token) {
    throw new Error('VERCEL_TOKEN environment variable is not set')
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

async function vercelFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${VERCEL_API}${endpoint}`
  const headers = getHeaders()

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(`Vercel API error (${response.status}): ${error.error?.message || JSON.stringify(error)}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export function createVercelMcpServer() {
  if (!process.env.VERCEL_TOKEN) {
    console.log('[Vercel] VERCEL_TOKEN not set, Vercel tools disabled')
    return null
  }

  console.log('[Vercel] Tools enabled')

  return createSdkMcpServer({
    name: 'vercel',
    version: '1.0.0',
    tools: [
      tool(
        'list_projects',
        'List all Vercel projects',
        {
          search: z.string().optional().describe('Search query to filter projects'),
          limit: z.number().optional().describe('Number of projects to return (default 20)'),
          source: z.enum(['external', 'clone', 'imported']).optional().describe('Filter by project source')
        },
        async ({ search, limit, source }) => {
          const params = new URLSearchParams()
          if (search) params.set('search', search)
          if (limit) params.set('limit', limit.toString())
          if (source) params.set('source', source)

          const data = await vercelFetch(`/v9/projects?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.projects.map(p => ({
                id: p.id,
                name: p.name,
                framework: p.framework,
                created_at: p.createdAt,
                updated_at: p.updatedAt,
                targets: p.targets,
                link: p.link
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'get_project',
        'Get details of a specific Vercel project',
        {
          id: z.string().describe('Project ID or name')
        },
        async ({ id }) => {
          const project = await vercelFetch(`/v9/projects/${id}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: project.id,
                name: project.name,
                framework: project.framework,
                created_at: project.createdAt,
                updated_at: project.updatedAt,
                targets: project.targets,
                link: project.link,
                latestDeployments: project.latestDeployments?.map(d => ({
                  id: d.id,
                  url: d.url,
                  created_at: d.createdAt,
                  state: d.state
                }))
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'create_project',
        'Create a new Vercel project',
        {
          name: z.string().describe('Project name'),
          framework: z.string().optional().describe('Framework (e.g., nextjs, remix, vite)'),
          build_command: z.string().optional().describe('Custom build command'),
          output_directory: z.string().optional().describe('Custom output directory'),
          install_command: z.string().optional().describe('Custom install command'),
          dev_command: z.string().optional().describe('Custom dev command'),
          environment: z.record(z.string()).optional().describe('Environment variables as key-value pairs')
        },
        async ({ name, framework, build_command, output_directory, install_command, dev_command, environment }) => {
          const body = { name }
          if (framework) body.framework = framework
          if (build_command) body.buildCommand = build_command
          if (output_directory) body.outputDirectory = output_directory
          if (install_command) body.installCommand = install_command
          if (dev_command) body.devCommand = dev_command
          if (environment) {
            body.environment = Object.entries(environment).map(([key, value]) => ({ key, value }))
          }

          const project = await vercelFetch('/v9/projects', {
            method: 'POST',
            body: JSON.stringify(body)
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                id: project.id,
                name: project.name,
                created_at: project.createdAt
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'delete_project',
        'Delete a Vercel project',
        {
          id: z.string().describe('Project ID or name')
        },
        async ({ id }) => {
          await vercelFetch(`/v9/projects/${id}`, { method: 'DELETE' })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, message: `Project ${id} deleted` }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_deployments',
        'List deployments for a Vercel project',
        {
          project_id: z.string().describe('Project ID'),
          limit: z.number().optional().describe('Number of deployments to return (default 10)'),
          state: z.enum(['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED']).optional().describe('Filter by deployment state'),
          target: z.enum(['production', 'preview']).optional().describe('Filter by deployment target')
        },
        async ({ project_id, limit, state, target }) => {
          const params = new URLSearchParams({ projectId: project_id })
          if (limit) params.set('limit', limit.toString())
          if (state) params.set('state', state)
          if (target) params.set('target', target)

          const data = await vercelFetch(`/v6/deployments?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.deployments.map(d => ({
                id: d.id,
                url: d.url,
                name: d.name,
                state: d.state,
                type: d.type,
                created_at: d.createdAt,
                ready_state: d.readyState,
                target: d.target
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'get_deployment',
        'Get details of a specific Vercel deployment',
        {
          id: z.string().describe('Deployment ID')
        },
        async ({ id }) => {
          const deployment = await vercelFetch(`/v13/deployments/${id}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: deployment.id,
                url: deployment.url,
                name: deployment.name,
                state: deployment.state,
                type: deployment.type,
                created_at: deployment.createdAt,
                ready_state: deployment.readyState,
                target: deployment.target,
                meta: deployment.meta,
                alias: deployment.alias
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'create_deployment',
        'Create a new Vercel deployment',
        {
          name: z.string().describe('Project name to deploy'),
          files: z.array(z.object({
            file: z.string().describe('File path'),
            data: z.string().describe('File content as string'),
            encoding: z.enum(['utf-8', 'base64']).optional().describe('Encoding (default utf-8)')
          })).optional().describe('Files to deploy'),
          project_settings: z.object({
            framework: z.string().optional()
          }).optional().describe('Project settings'),
          target: z.enum(['production', 'preview']).optional().describe('Deployment target'),
          git_source: z.object({
            ref: z.string(),
            repoId: z.number(),
            orgId: z.string()
          }).optional().describe('Git source for deployment')
        },
        async ({ name, files, project_settings, target, git_source }) => {
          const body = { name, target: target || 'production' }
          if (files) {
            body.files = files.map(f => ({
              file: f.file,
              data: f.data,
              encoding: f.encoding || 'utf-8'
            }))
          }
          if (project_settings) body.projectSettings = project_settings
          if (git_source) body.gitSource = git_source

          const deployment = await vercelFetch('/v13/deployments', {
            method: 'POST',
            body: JSON.stringify(body)
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                id: deployment.id,
                url: deployment.url,
                state: deployment.readyState,
                created_at: deployment.createdAt
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'cancel_deployment',
        'Cancel an in-progress Vercel deployment',
        {
          id: z.string().describe('Deployment ID')
        },
        async ({ id }) => {
          const result = await vercelFetch(`/v13/deployments/${id}/cancel`, {
            method: 'PATCH'
          })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                id: result.id,
                state: result.readyState,
                message: `Deployment ${id} cancelled`
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_domains',
        'List domains for a Vercel project',
        {
          project_id: z.string().describe('Project ID')
        },
        async ({ project_id }) => {
          const data = await vercelFetch(`/v9/projects/${project_id}/domains`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.domains.map(d => ({
                name: d.name,
                created_at: d.createdAt,
                verified: d.verified
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'add_domain',
        'Add a domain to a Vercel project',
        {
          project_id: z.string().describe('Project ID'),
          name: z.string().describe('Domain name (e.g., example.com)')
        },
        async ({ project_id, name }) => {
          const result = await vercelFetch(`/v9/projects/${project_id}/domains`, {
            method: 'POST',
            body: JSON.stringify({ name })
          })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                name: result.name,
                created_at: result.createdAt,
                verified: result.verified
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'remove_domain',
        'Remove a domain from a Vercel project',
        {
          project_id: z.string().describe('Project ID'),
          domain: z.string().describe('Domain name to remove')
        },
        async ({ project_id, domain }) => {
          await vercelFetch(`/v9/projects/${project_id}/domains/${domain}`, {
            method: 'DELETE'
          })
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Domain ${domain} removed from project ${project_id}`
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_deployment_logs',
        'Get build/runtime logs for a deployment',
        {
          deployment_id: z.string().describe('Deployment ID'),
          type: z.enum(['build', 'runtime']).optional().describe('Log type filter'),
          limit: z.number().optional().describe('Number of log lines to return (default 200)')
        },
        async ({ deployment_id, type, limit }) => {
          const params = new URLSearchParams()
          if (type) params.set('type', type)
          if (limit) params.set('limit', limit.toString())

          const data = await vercelFetch(`/v13/deployments/${deployment_id}/events?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data.map(e => ({
                type: e.type,
                payload: e.payload
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'get_analytics',
        'Get analytics data for a project (page views, visitors, top pages)',
        {
          project_id: z.string().describe('Project ID'),
          period: z.enum(['24h', '7d', '30d', '90d']).optional().describe('Time period (default: 30d)'),
          hostname: z.string().optional().describe('Filter by hostname'),
          pathname: z.string().optional().describe('Filter by pathname')
        },
        async ({ project_id, period, hostname, pathname }) => {
          const params = new URLSearchParams({ projectId: project_id })
          if (period) params.set('period', period)
          if (hostname) params.set('hostname', hostname)
          if (pathname) params.set('pathname', pathname)

          const data = await vercelFetch(`/v1/analytics?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                project_id,
                period: period || '30d',
                data: data
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_analytics_metrics',
        'Get specific analytics metrics (visitors, pageviews, bounce rate, etc.)',
        {
          project_id: z.string().describe('Project ID'),
          metric: z.enum(['visitors', 'pageviews', 'bounce_rate', 'session_duration', 'top_pages', 'top_referrers', 'top_countries', 'top_browsers', 'top_devices']).describe('Metric to retrieve'),
          period: z.enum(['24h', '7d', '30d', '90d']).optional().describe('Time period (default: 30d)')
        },
        async ({ project_id, metric, period }) => {
          const params = new URLSearchParams({
            projectId: project_id,
            metric
          })
          if (period) params.set('period', period)

          const data = await vercelFetch(`/v1/analytics/metrics?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                project_id,
                metric,
                period: period || '30d',
                data: data
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_web_vitals',
        'Get Core Web Vitals (LCP, FID, CLS, TTFB) for a project',
        {
          project_id: z.string().describe('Project ID'),
          period: z.enum(['24h', '7d', '30d']).optional().describe('Time period (default: 7d)')
        },
        async ({ project_id, period }) => {
          const params = new URLSearchParams({ projectId: project_id })
          if (period) params.set('period', period)

          const data = await vercelFetch(`/v1/analytics/web-vitals?${params}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                project_id,
                period: period || '7d',
                web_vitals: data
              }, null, 2)
            }]
          }
        }
      )
    ]
  })
}
