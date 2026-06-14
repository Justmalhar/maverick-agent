import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const GITHUB_API = 'https://api.github.com'

function getHeaders() {
  const pat = process.env.GITHUB_PAT
  if (!pat) {
    throw new Error('GITHUB_PAT environment variable is not set')
  }
  return {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
}

async function githubFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API}${endpoint}`
  const headers = getHeaders()

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(`GitHub API error (${response.status}): ${error.message}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export function createGitHubMcpServer() {
  if (!process.env.GITHUB_PAT) {
    console.log('[GitHub] GITHUB_PAT not set, GitHub tools disabled')
    return null
  }

  console.log('[GitHub] Tools enabled')

  return createSdkMcpServer({
    name: 'github',
    version: '1.0.0',
    tools: [
      tool(
        'get_authenticated_user',
        'Get the authenticated GitHub user (use to verify PAT works)',
        {},
        async () => {
          const user = await githubFetch('/user')
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                login: user.login,
                name: user.name,
                public_repos: user.public_repos,
                followers: user.followers
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_repos',
        'List repositories for the authenticated user or a specific org/user',
        {
          owner: z.string().optional().describe('Organization or username to list repos for (defaults to authenticated user)'),
          type: z.enum(['all', 'owner', 'public', 'private', 'forks', 'sources', 'member']).optional().describe('Repository type filter'),
          sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().describe('Sort order'),
          per_page: z.number().optional().describe('Results per page (max 100)')
        },
        async ({ owner, type, sort, per_page }) => {
          const params = new URLSearchParams()
          if (type) params.set('type', type)
          if (sort) params.set('sort', sort)
          if (per_page) params.set('per_page', per_page.toString())

          const endpoint = owner ? `/users/${owner}/repos` : '/user/repos'
          const repos = await githubFetch(`${endpoint}?${params}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(repos.map(r => ({
                name: r.name,
                full_name: r.full_name,
                description: r.description,
                private: r.private,
                language: r.language,
                stargazers_count: r.stargazers_count,
                updated_at: r.updated_at
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'get_repo',
        'Get details of a specific repository',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name')
        },
        async ({ owner, repo }) => {
          const repository = await githubFetch(`/repos/${owner}/${repo}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                name: repository.name,
                full_name: repository.full_name,
                description: repository.description,
                private: repository.private,
                language: repository.language,
                default_branch: repository.default_branch,
                stargazers_count: repository.stargazers_count,
                forks_count: repository.forks_count,
                open_issues_count: repository.open_issues_count,
                created_at: repository.created_at,
                updated_at: repository.updated_at,
                clone_url: repository.clone_url,
                ssh_url: repository.ssh_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'create_repo',
        'Create a new repository',
        {
          name: z.string().describe('Repository name'),
          description: z.string().optional().describe('Repository description'),
          private: z.boolean().optional().describe('Make repo private (default: false)'),
          auto_init: z.boolean().optional().describe('Initialize with README (default: true)')
        },
        async ({ name, description, private, auto_init }) => {
          const repo = await githubFetch('/user/repos', {
            method: 'POST',
            body: JSON.stringify({
              name,
              description,
              private: private || false,
              auto_init: auto_init !== false
            })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                full_name: repo.full_name,
                clone_url: repo.clone_url,
                ssh_url: repo.ssh_url,
                html_url: repo.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_issues',
        'List issues in a repository',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state filter'),
          labels: z.string().optional().describe('Comma-separated label names'),
          assignee: z.string().optional().describe('Assignee username'),
          per_page: z.number().optional().describe('Results per page (max 100)')
        },
        async ({ owner, repo, state, labels, assignee, per_page }) => {
          const params = new URLSearchParams()
          if (state) params.set('state', state)
          if (labels) params.set('labels', labels)
          if (assignee) params.set('assignee', assignee)
          if (per_page) params.set('per_page', per_page.toString())

          const issues = await githubFetch(`/repos/${owner}/${repo}/issues?${params}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(issues.map(i => ({
                number: i.number,
                title: i.title,
                state: i.state,
                user: i.user?.login,
                labels: i.labels.map(l => l.name),
                assignees: i.assignees?.map(a => a.login) || [],
                comments: i.comments,
                created_at: i.created_at,
                updated_at: i.updated_at
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'get_issue',
        'Get details of a specific issue',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          issue_number: z.number().describe('Issue number')
        },
        async ({ owner, repo, issue_number }) => {
          const issue = await githubFetch(`/repos/${owner}/${repo}/issues/${issue_number}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                body: issue.body,
                user: issue.user?.login,
                labels: issue.labels.map(l => l.name),
                assignees: issue.assignees?.map(a => a.login) || [],
                milestone: issue.milestone?.title,
                comments: issue.comments,
                created_at: issue.created_at,
                updated_at: issue.updated_at,
                html_url: issue.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'create_issue',
        'Create a new issue in a repository',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          title: z.string().describe('Issue title'),
          body: z.string().optional().describe('Issue body/description'),
          labels: z.array(z.string()).optional().describe('Array of label names'),
          assignees: z.array(z.string()).optional().describe('Array of usernames to assign')
        },
        async ({ owner, repo, title, body, labels, assignees }) => {
          const issue = await githubFetch(`/repos/${owner}/${repo}/issues`, {
            method: 'POST',
            body: JSON.stringify({ title, body, labels, assignees })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                number: issue.number,
                title: issue.title,
                html_url: issue.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'update_issue',
        'Update an existing issue',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          issue_number: z.number().describe('Issue number'),
          title: z.string().optional().describe('New title'),
          body: z.string().optional().describe('New body'),
          state: z.enum(['open', 'closed']).optional().describe('New state'),
          labels: z.array(z.string()).optional().describe('New labels'),
          assignees: z.array(z.string()).optional().describe('New assignees')
        },
        async ({ owner, repo, issue_number, title, body, state, labels, assignees }) => {
          const issue = await githubFetch(`/repos/${owner}/${repo}/issues/${issue_number}`, {
            method: 'PATCH',
            body: JSON.stringify({ title, body, state, labels, assignees })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                number: issue.number,
                title: issue.title,
                state: issue.state,
                html_url: issue.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_pull_requests',
        'List pull requests in a repository',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter'),
          per_page: z.number().optional().describe('Results per page (max 100)')
        },
        async ({ owner, repo, state, per_page }) => {
          const params = new URLSearchParams()
          if (state) params.set('state', state)
          if (per_page) params.set('per_page', per_page.toString())

          const prs = await githubFetch(`/repos/${owner}/${repo}/pulls?${params}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(prs.map(pr => ({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                user: pr.user?.login,
                head: pr.head?.ref,
                base: pr.base?.ref,
                merged: pr.merged,
                mergeable: pr.mergeable,
                comments: pr.comments,
                review_comments: pr.review_comments,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                html_url: pr.html_url
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'get_pull_request',
        'Get details of a specific pull request',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          pr_number: z.number().describe('Pull request number')
        },
        async ({ owner, repo, pr_number }) => {
          const pr = await githubFetch(`/repos/${owner}/${repo}/pulls/${pr_number}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                body: pr.body,
                user: pr.user?.login,
                head: pr.head?.ref,
                base: pr.base?.ref,
                merged: pr.merged,
                mergeable: pr.mergeable,
                mergeable_state: pr.mergeable_state,
                comments: pr.comments,
                review_comments: pr.review_comments,
                commits: pr.commits,
                additions: pr.additions,
                deletions: pr.deletions,
                changed_files: pr.changed_files,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                html_url: pr.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'create_pull_request',
        'Create a new pull request',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          title: z.string().describe('PR title'),
          body: z.string().optional().describe('PR description'),
          head: z.string().describe('Branch name containing changes'),
          base: z.string().describe('Branch name to merge into'),
          draft: z.boolean().optional().describe('Create as draft PR')
        },
        async ({ owner, repo, title, body, head, base, draft }) => {
          const pr = await githubFetch(`/repos/${owner}/${repo}/pulls`, {
            method: 'POST',
            body: JSON.stringify({ title, body, head, base, draft: draft || false })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                number: pr.number,
                title: pr.title,
                html_url: pr.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'create_comment',
        'Create a comment on an issue or pull request',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          issue_number: z.number().describe('Issue or PR number'),
          body: z.string().describe('Comment body')
        },
        async ({ owner, repo, issue_number, body }) => {
          const comment = await githubFetch(`/repos/${owner}/${repo}/issues/${issue_number}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                id: comment.id,
                html_url: comment.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_commits',
        'List commits in a repository',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          sha: z.string().optional().describe('Branch/tag/commit SHA'),
          path: z.string().optional().describe('File path to filter commits'),
          per_page: z.number().optional().describe('Results per page (max 100)')
        },
        async ({ owner, repo, sha, path, per_page }) => {
          const params = new URLSearchParams()
          if (sha) params.set('sha', sha)
          if (path) params.set('path', path)
          if (per_page) params.set('per_page', per_page.toString())

          const commits = await githubFetch(`/repos/${owner}/${repo}/commits?${params}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(commits.map(c => ({
                sha: c.sha,
                message: c.commit.message,
                author: c.commit.author?.name,
                date: c.commit.author?.date,
                url: c.html_url
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'get_file_contents',
        'Get the contents of a file from a repository',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('File path'),
          ref: z.string().optional().describe('Branch, tag, or commit SHA')
        },
        async ({ owner, repo, path, ref }) => {
          const params = ref ? `?ref=${ref}` : ''
          const file = await githubFetch(`/repos/${owner}/${repo}/contents/${path}${params}`)

          let content = file.content
          if (file.encoding === 'base64') {
            content = Buffer.from(file.content, 'base64').toString('utf-8')
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                name: file.name,
                path: file.path,
                size: file.size,
                sha: file.sha,
                content: content,
                html_url: file.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'create_or_update_file',
        'Create or update a file in a repository',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('File path'),
          message: z.string().describe('Commit message'),
          content: z.string().describe('File content (will be base64 encoded)'),
          sha: z.string().optional().describe('SHA of existing file (required for updates)'),
          branch: z.string().optional().describe('Branch name')
        },
        async ({ owner, repo, path, message, content, sha, branch }) => {
          const body = {
            message,
            content: Buffer.from(content).toString('base64')
          }
          if (sha) body.sha = sha
          if (branch) body.branch = branch

          const result = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, {
            method: 'PUT',
            body: JSON.stringify(body)
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                sha: result.content?.sha,
                html_url: result.content?.html_url
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_workflows',
        'List GitHub Actions workflows in a repository',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name')
        },
        async ({ owner, repo }) => {
          const workflows = await githubFetch(`/repos/${owner}/${repo}/actions/workflows`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(workflows.workflows.map(w => ({
                id: w.id,
                name: w.name,
                path: w.path,
                state: w.state,
                created_at: w.created_at,
                updated_at: w.updated_at
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'list_workflow_runs',
        'List recent runs of a GitHub Actions workflow',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          workflow_id: z.number().optional().describe('Workflow ID (defaults to main workflow)'),
          per_page: z.number().optional().describe('Results per page (max 100)')
        },
        async ({ owner, repo, workflow_id, per_page }) => {
          const params = new URLSearchParams()
          if (per_page) params.set('per_page', per_page.toString())

          let endpoint
          if (workflow_id) {
            endpoint = `/repos/${owner}/${repo}/actions/workflows/${workflow_id}/runs?${params}`
          } else {
            endpoint = `/repos/${owner}/${repo}/actions/runs?${params}`
          }

          const runs = await githubFetch(endpoint)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(runs.workflow_runs?.map(r => ({
                id: r.id,
                name: r.name,
                status: r.status,
                conclusion: r.conclusion,
                head_branch: r.head_branch,
                created_at: r.created_at,
                updated_at: r.updated_at,
                html_url: r.html_url
              })) || runs.map(r => ({
                id: r.id,
                name: r.name || r.head_branch,
                status: r.status,
                conclusion: r.conclusion,
                created_at: r.created_at,
                html_url: r.html_url
              })), null, 2)
            }]
          }
        }
      ),

      tool(
        'trigger_workflow',
        'Trigger a GitHub Actions workflow',
        {
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          workflow_id: z.string().describe('Workflow ID or filename'),
          ref: z.string().describe('Branch or tag to run the workflow on'),
          inputs: z.record(z.string()).optional().describe('Workflow inputs')
        },
        async ({ owner, repo, workflow_id, ref, inputs }) => {
          await githubFetch(`/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`, {
            method: 'POST',
            body: JSON.stringify({ ref, inputs })
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Workflow ${workflow_id} triggered on ${ref}`
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'search_repos',
        'Search for repositories on GitHub',
        {
          query: z.string().describe('Search query'),
          sort: z.enum(['stars', 'forks', 'updated', 'best-match']).optional().describe('Sort order'),
          per_page: z.number().optional().describe('Results per page (max 100)')
        },
        async ({ query, sort, per_page }) => {
          const params = new URLSearchParams({ q: query })
          if (sort) params.set('sort', sort)
          if (per_page) params.set('per_page', per_page.toString())

          const results = await githubFetch(`/search/repositories?${params}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                total_count: results.total_count,
                items: results.items?.map(r => ({
                  name: r.full_name,
                  description: r.description,
                  stars: r.stargazers_count,
                  language: r.language,
                  updated_at: r.updated_at,
                  html_url: r.html_url
                }))
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'search_code',
        'Search for code across GitHub repositories',
        {
          query: z.string().describe('Search query (e.g., "repo:owner/repo filename:main.js")'),
          per_page: z.number().optional().describe('Results per page (max 100)')
        },
        async ({ query, per_page }) => {
          const params = new URLSearchParams({ q: query })
          if (per_page) params.set('per_page', per_page.toString())

          const results = await githubFetch(`/search/code?${params}`)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                total_count: results.total_count,
                items: results.items?.map(f => ({
                  name: f.name,
                  path: f.path,
                  repository: f.repository?.full_name,
                  html_url: f.html_url
                }))
              }, null, 2)
            }]
          }
        }
      )
    ]
  })
}
