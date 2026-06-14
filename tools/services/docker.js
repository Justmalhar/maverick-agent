import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { exec, execSync } from 'child_process'

function isDockerInstalled() {
  try {
    execSync('docker --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function runSync(cmd) {
  return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim()
}

function parseJson(str) {
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}

function runAsync(cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf-8', timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout.trim())
    })
  })
}

export function createDockerMcpServer() {
  if (!isDockerInstalled()) {
    console.log('[Docker] Docker is not installed or not in PATH, Docker tools disabled')
    return null
  }

  console.log('[Docker] Tools enabled')

  return createSdkMcpServer({
    name: 'docker',
    version: '1.0.0',
    tools: [
      tool(
        'list_containers',
        'List all Docker containers (running and stopped)',
        {
          all: z.boolean().optional().describe('Show all containers (default true)'),
          format: z.string().optional().describe('Output format (default: json)')
        },
        async ({ all = true, format = 'json' }) => {
          const cmd = `docker ps -a --format ${format === 'json' ? '"{{json .}}"' : '"{{.Names}}\t{{.Status}}\t{{.Image}}"'}`
          const output = runSync(cmd)
          const containers = output.split('\n').filter(Boolean).map(line => parseJson(line))
          return {
            content: [{ type: 'text', text: JSON.stringify(containers, null, 2) }]
          }
        }
      ),

      tool(
        'get_container',
        'Get detailed information about a Docker container',
        {
          container: z.string().describe('Container ID or name')
        },
        async ({ container }) => {
          const output = runSync(`docker inspect ${container}`)
          return {
            content: [{ type: 'text', text: output }]
          }
        }
      ),

      tool(
        'start_container',
        'Start a stopped Docker container',
        {
          container: z.string().describe('Container ID or name')
        },
        async ({ container }) => {
          const output = runSync(`docker start ${container}`)
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Container ${output} started` }, null, 2) }]
          }
        }
      ),

      tool(
        'stop_container',
        'Stop a running Docker container',
        {
          container: z.string().describe('Container ID or name'),
          time: z.number().optional().describe('Seconds to wait before killing (default 10)')
        },
        async ({ container, time }) => {
          const cmd = time !== undefined ? `docker stop -t ${time} ${container}` : `docker stop ${container}`
          const output = runSync(cmd)
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Container ${output} stopped` }, null, 2) }]
          }
        }
      ),

      tool(
        'restart_container',
        'Restart a Docker container',
        {
          container: z.string().describe('Container ID or name'),
          time: z.number().optional().describe('Seconds to wait before killing (default 10)')
        },
        async ({ container, time }) => {
          const cmd = time !== undefined ? `docker restart -t ${time} ${container}` : `docker restart ${container}`
          const output = runSync(cmd)
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Container ${output} restarted` }, null, 2) }]
          }
        }
      ),

      tool(
        'remove_container',
        'Remove a Docker container (must be stopped first unless force is true)',
        {
          container: z.string().describe('Container ID or name'),
          force: z.boolean().optional().describe('Force removal even if running (default false)'),
          volumes: z.boolean().optional().describe('Also remove associated volumes (default false)')
        },
        async ({ container, force = false, volumes = false }) => {
          let cmd = 'docker rm'
          if (force) cmd += ' -f'
          if (volumes) cmd += ' -v'
          cmd += ` ${container}`
          const output = runSync(cmd)
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Container ${output} removed` }, null, 2) }]
          }
        }
      ),

      tool(
        'container_logs',
        'Get logs from a Docker container',
        {
          container: z.string().describe('Container ID or name'),
          tail: z.number().optional().describe('Number of lines to show from end (default 100)'),
          since: z.string().optional().describe('Show logs since timestamp (e.g. "2023-01-01T00:00:00")'),
          follow: z.boolean().optional().describe('Follow log output (streams output, use for live monitoring)')
        },
        async ({ container, tail = 100, since, follow = false }) => {
          let cmd = `docker logs --tail ${tail}`
          if (since) cmd += ` --since ${since}`
          if (follow) cmd += ' -f'
          cmd += ` ${container}`

          if (follow) {
            const output = await runAsync(cmd, 10000)
            return {
              content: [{ type: 'text', text: output || 'No logs available (container may not be running)' }]
            }
          }

          const output = runSync(cmd)
          return {
            content: [{ type: 'text', text: output || 'No logs available' }]
          }
        }
      ),

      tool(
        'exec_command',
        'Execute a command inside a running Docker container',
        {
          container: z.string().describe('Container ID or name'),
          command: z.string().describe('Command to execute'),
          interactive: z.boolean().optional().describe('Run in interactive mode (default false)')
        },
        async ({ container, command, interactive = false }) => {
          let cmd = 'docker exec'
          if (interactive) cmd += ' -it'
          cmd += ` ${container} ${command}`
          const output = runSync(cmd)
          return {
            content: [{ type: 'text', text: output || 'Command executed (no output)' }]
          }
        }
      ),

      tool(
        'list_images',
        'List all Docker images',
        {
          all: z.boolean().optional().describe('Show all images including intermediate (default false)'),
          filter: z.string().optional().describe('Filter output (e.g. "dangling=true", "reference=nginx")')
        },
        async ({ all = false, filter }) => {
          let cmd = 'docker images'
          if (all) cmd += ' -a'
          if (filter) cmd += ` --filter "${filter}"`
          cmd += ' --format "{{json .}}"'
          const output = runSync(cmd)
          const images = output.split('\n').filter(Boolean).map(line => parseJson(line))
          return {
            content: [{ type: 'text', text: JSON.stringify(images, null, 2) }]
          }
        }
      ),

      tool(
        'pull_image',
        'Pull a Docker image from a registry',
        {
          image: z.string().describe('Image name (e.g. "nginx:latest", "ubuntu:22.04")'),
          platform: z.string().optional().describe('Platform to pull (e.g. "linux/amd64", "linux/arm64")')
        },
        async ({ image, platform }) => {
          let cmd = 'docker pull'
          if (platform) cmd += ` --platform ${platform}`
          cmd += ` ${image}`
          const output = await runAsync(cmd, 120000)
          return {
            content: [{ type: 'text', text: output || `Image ${image} pulled successfully` }]
          }
        }
      ),

      tool(
        'remove_image',
        'Remove a Docker image',
        {
          image: z.string().describe('Image ID or name'),
          force: z.boolean().optional().describe('Force removal (default false)')
        },
        async ({ image, force = false }) => {
          let cmd = 'docker rmi'
          if (force) cmd += ' -f'
          cmd += ` ${image}`
          const output = runSync(cmd)
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, message: output }, null, 2) }]
          }
        }
      ),

      tool(
        'compose_up',
        'Start a Docker Compose stack in detached mode',
        {
          path: z.string().optional().describe('Path to docker-compose.yml directory'),
          service: z.string().optional().describe('Start only a specific service'),
          build: z.boolean().optional().describe('Rebuild images before starting (default false)'),
          force_recreate: z.boolean().optional().describe('Force recreate containers (default false)')
        },
        async ({ path, service, build = false, force_recreate = false }) => {
          let cmd = 'docker compose'
          if (path) cmd += ` -f ${path}`
          cmd += ' up -d'
          if (build) cmd += ' --build'
          if (force_recreate) cmd += ' --force-recreate'
          if (service) cmd += ` ${service}`
          const output = await runAsync(cmd, 120000)
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, output }, null, 2) }]
          }
        }
      ),

      tool(
        'compose_down',
        'Stop and remove a Docker Compose stack',
        {
          path: z.string().optional().describe('Path to docker-compose.yml directory'),
          volumes: z.boolean().optional().describe('Also remove volumes (default false)'),
          remove_images: z.enum(['all', 'local']).optional().describe('Remove images used by the service')
        },
        async ({ path, volumes = false, remove_images }) => {
          let cmd = 'docker compose'
          if (path) cmd += ` -f ${path}`
          cmd += ' down'
          if (volumes) cmd += ' -v'
          if (remove_images) cmd += ` --rmi ${remove_images}`
          const output = await runAsync(cmd, 120000)
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, output }, null, 2) }]
          }
        }
      ),

      tool(
        'compose_logs',
        'Get logs from a Docker Compose stack',
        {
          path: z.string().optional().describe('Path to docker-compose.yml directory'),
          service: z.string().optional().describe('Get logs for a specific service'),
          tail: z.number().optional().describe('Number of lines to show (default 100)'),
          follow: z.boolean().optional().describe('Follow log output (default false)')
        },
        async ({ path, service, tail = 100, follow = false }) => {
          let cmd = 'docker compose'
          if (path) cmd += ` -f ${path}`
          cmd += ' logs --tail ' + tail
          if (follow) cmd += ' -f'
          if (service) cmd += ` ${service}`
          const output = await runAsync(cmd, 30000)
          return {
            content: [{ type: 'text', text: output || 'No logs available' }]
          }
        }
      ),

      tool(
        'system_info',
        'Get Docker system disk usage and resource information',
        {},
        async () => {
          const output = runSync('docker system df')
          return {
            content: [{ type: 'text', text: output }]
          }
        }
      )
    ]
  })
}
