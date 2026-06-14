import os from 'os'
import { execSync } from 'child_process'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const SENSITIVE_VARS = new Set([
  'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'SECRET_KEY', 'PRIVATE_KEY',
  'API_KEY', 'API_SECRET', 'ACCESS_TOKEN', 'AUTH_TOKEN', 'CREDENTIAL',
  'PASSWORD', 'PASSWD', 'SECRET', 'TOKEN', 'DATABASE_URL', 'MONGO_URI',
  'REDIS_URL', 'SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY', 'BRAVE_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN',
  'NPM_TOKEN', 'DOTENV_KEY', 'WEBHOOK_SECRET', 'SIGNING_SECRET'
])

function isSensitive(key) {
  const upper = key.toUpperCase()
  for (const pattern of SENSITIVE_VARS) {
    if (upper.includes(pattern)) return true
  }
  return false
}

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim()
  } catch (e) {
    return e.stderr || e.message
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${d}d ${h}h ${m}m ${s}s`
}

export function createSystemMcpServer() {
  console.log('[System] Tools enabled')

  return createSdkMcpServer({
    name: 'system-monitor',
    version: '1.0.0',
    tools: [
      tool(
        'get_cpu_info',
        'Get CPU information including model, speed, core count, and current usage percentage.',
        {},
        async () => {
          const cpus = os.cpus()
          const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0)
          const totalTick = cpus.reduce((acc, cpu) =>
            acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle, 0)
          const usage = ((1 - totalIdle / totalTick) * 100).toFixed(1)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                model: cpus[0]?.model || 'Unknown',
                speed_mhz: cpus[0]?.speed || 0,
                cores: cpus.length,
                usage_percent: parseFloat(usage),
                details: cpus.map((cpu, i) => ({
                  core: i,
                  model: cpu.model,
                  speed: cpu.speed,
                  times: cpu.times
                }))
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_memory_info',
        'Get system memory usage including total, free, used, and usage percentage.',
        {},
        async () => {
          const total = os.totalmem()
          const free = os.freemem()
          const used = total - free

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                total_gb: (total / 1073741824).toFixed(2),
                free_gb: (free / 1073741824).toFixed(2),
                used_gb: (used / 1073741824).toFixed(2),
                usage_percent: ((used / total) * 100).toFixed(1),
                total_bytes: total,
                free_bytes: free,
                used_bytes: used
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_disk_info',
        'Get disk usage information for all mounted filesystems.',
        {},
        async () => {
          const output = exec('df -h')
          const lines = output.split('\n').slice(1).filter(l => l.trim())
          const disks = lines.map(line => {
            const parts = line.split(/\s+/)
            return {
              filesystem: parts[0],
              size: parts[1],
              used: parts[2],
              available: parts[3],
              use_percent: parts[4],
              mount: parts[5]
            }
          }).filter(d => !d.filesystem?.startsWith('devfs') && !d.filesystem?.startsWith('map'))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ disks }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_network_info',
        'Get network interface information including IP addresses, MAC addresses, and status.',
        {},
        async () => {
          const interfaces = os.networkInterfaces()
          const result = {}

          for (const [name, addrs] of Object.entries(interfaces)) {
            result[name] = addrs.map(addr => ({
              address: addr.address,
              family: addr.family,
              mac: addr.mac,
              internal: addr.internal,
              cidr: addr.cidr
            }))
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ interfaces: result }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_process_list',
        'List top processes sorted by CPU or memory usage.',
        {
          sort_by: z.enum(['cpu', 'memory']).optional().describe('Sort by cpu or memory (default: cpu)'),
          count: z.number().optional().describe('Number of processes to return (default: 15)')
        },
        async ({ sort_by = 'cpu', count = 15 }) => {
          const sortFlag = sort_by === 'memory' ? '-m' : '-r'
          const output = exec(`ps aux --sort=${sortFlag === '-r' ? '%cpu' : '%mem'} | head -${count + 1}`)
          const lines = output.split('\n').slice(1).filter(l => l.trim())
          const processes = lines.map(line => {
            const parts = line.split(/\s+/)
            return {
              user: parts[0],
              pid: parseInt(parts[1]),
              cpu_percent: parseFloat(parts[2]),
              mem_percent: parseFloat(parts[3]),
              vsz: parts[4],
              rss: parts[5],
              command: parts.slice(10).join(' ')
            }
          })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ sort_by, count: processes.length, processes }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_system_info',
        'Get system hostname, platform, OS type, architecture, and uptime.',
        {},
        async () => {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                hostname: os.hostname(),
                platform: os.platform(),
                arch: os.arch(),
                release: os.release(),
                type: os.type(),
                uptime: formatUptime(os.uptime()),
                uptime_seconds: os.uptime()
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'kill_process',
        'Kill a process by PID. Use with caution.',
        {
          pid: z.number().describe('Process ID to kill'),
          signal: z.enum(['SIGTERM', 'SIGKILL', 'SIGHUP', 'SIGINT']).optional()
            .describe('Signal to send (default: SIGTERM)')
        },
        async ({ pid, signal = 'SIGTERM' }) => {
          const output = exec(`kill -${signal} ${pid} 2>&1`)
          const success = !output || output === ''

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                pid,
                signal,
                success,
                message: success ? `Process ${pid} killed with ${signal}` : `Failed: ${output}`
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_load_average',
        'Get system load averages for 1, 5, and 15 minute intervals.',
        {},
        async () => {
          const [load1, load5, load15] = os.loadavg()
          const cores = os.cpus().length

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                load_1m: load1.toFixed(2),
                load_5m: load5.toFixed(2),
                load_15m: load15.toFixed(2),
                cores,
                normalized: {
                  load_1m: (load1 / cores).toFixed(2),
                  load_5m: (load5 / cores).toFixed(2),
                  load_15m: (load15 / cores).toFixed(2)
                }
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'get_environment',
        'Get environment variables with sensitive values redacted.',
        {
          filter: z.string().optional().describe('Filter variables by name prefix (e.g., "NODE", "PATH")')
        },
        async ({ filter }) => {
          const vars = Object.entries(process.env)
            .filter(([key]) => !filter || key.toUpperCase().startsWith(filter.toUpperCase()))
            .map(([key, value]) => ({
              key,
              value: isSensitive(key) ? '[REDACTED]' : value
            }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                count: vars.length,
                filter: filter || 'none',
                variables: vars
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'watch_command',
        'Run a shell command and return its output. Useful for monitoring system state.',
        {
          command: z.string().describe('Shell command to execute'),
          timeout_ms: z.number().optional().describe('Timeout in milliseconds (default: 10000)')
        },
        async ({ command, timeout_ms = 10000 }) => {
          const startTime = Date.now()
          let output, error

          try {
            output = execSync(command, {
              encoding: 'utf-8',
              timeout: timeout_ms
            })
          } catch (e) {
            output = e.stdout || ''
            error = e.stderr || e.message
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                command,
                duration_ms: Date.now() - startTime,
                stdout: output.trim(),
                stderr: error?.trim() || null,
                exit_code: error ? 1 : 0
              }, null, 2)
            }]
          }
        }
      )
    ]
  })
}
