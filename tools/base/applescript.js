import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Run an AppleScript snippet via osascript
 */
async function runOsascript(script) {
  try {
    const { stdout, stderr } = await execFileAsync('osascript', ['-e', script], {
      timeout: 30000
    })
    return { success: true, output: stdout.trim(), stderr: stderr.trim() || undefined }
  } catch (err) {
    return { success: false, error: err.message, stderr: err.stderr?.trim() }
  }
}

/**
 * Create the AppleScript MCP Server with macOS automation tools
 */
export function createAppleScriptMcpServer() {
  if (process.platform !== 'darwin') {
    console.log('[AppleScript] Not on macOS, skipping AppleScript tools')
    return null
  }

  console.log('[AppleScript] Tools available')

  return createSdkMcpServer({
    name: 'applescript',
    version: '1.0.0',
    tools: [
      tool(
        'run_script',
        'Execute arbitrary AppleScript code via osascript. Returns stdout/stderr. Use for macOS automation — controlling apps, system actions, UI scripting, etc.',
        {
          script: z.string().describe('The AppleScript code to execute')
        },
        async (args) => {
          const result = await runOsascript(args.script)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        }
      ),

      tool(
        'list_apps',
        'List currently running (foreground) applications on macOS.',
        {},
        async () => {
          const result = await runOsascript(
            'tell application "System Events" to get name of every process whose background only is false'
          )
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Running apps: ${result.output}`
                : `Error: ${result.error}`
            }]
          }
        }
      ),

      tool(
        'activate_app',
        'Bring a macOS application to the foreground.',
        {
          app_name: z.string().describe('Name of the application to activate (e.g. "Safari", "Finder")')
        },
        async (args) => {
          const result = await runOsascript(
            `tell application "${args.app_name}" to activate`
          )
          return {
            content: [{
              type: 'text',
              text: result.success
                ? `Activated ${args.app_name}`
                : `Error: ${result.error}`
            }]
          }
        }
      ),

      tool(
        'display_notification',
        'Show a macOS notification banner.',
        {
          message: z.string().describe('Notification body text'),
          title: z.string().optional().describe('Notification title')
        },
        async (args) => {
          const titlePart = args.title
            ? ` with title "${args.title}"`
            : ''
          const result = await runOsascript(
            `display notification "${args.message}"${titlePart}`
          )
          return {
            content: [{
              type: 'text',
              text: result.success
                ? 'Notification displayed'
                : `Error: ${result.error}`
            }]
          }
        }
      )
    ]
  })
}

export default { createAppleScriptMcpServer }
