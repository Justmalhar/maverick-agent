import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

const WORKSPACE = process.env.MAVERICK_AGENT_WORKSPACE || path.join(os.homedir(), 'maverick-agent')
const MEMORY_DIR = path.join(WORKSPACE, 'Memory')
const FILE_SYSTEM_TEMPLATE = path.join(PROJECT_ROOT, 'file-system')

/**
 * Memory Manager for Maverick Agent
 * Handles daily logs, curated long-term memory, and workspace structure
 */
export default class MemoryManager {
  constructor() {
    this.workspace = WORKSPACE
    this.memoryDir = MEMORY_DIR
    this.ensureWorkspace()
  }

  ensureWorkspace() {
    if (!fs.existsSync(this.workspace)) {
      fs.mkdirSync(this.workspace, { recursive: true })
    }
    this.copyFileSystemTemplate()
  }

  copyFileSystemTemplate() {
    if (!fs.existsSync(FILE_SYSTEM_TEMPLATE)) return

    const marker = path.join(this.workspace, '.initialized')
    if (fs.existsSync(marker)) return

    console.log('[Maverick] First run detected - copying workspace template...')
    this.copyDirRecursive(FILE_SYSTEM_TEMPLATE, this.workspace)
    fs.writeFileSync(marker, new Date().toISOString())
    console.log('[Maverick] Workspace initialized from template')
  }

  copyDirRecursive(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true })
        }
        this.copyDirRecursive(srcPath, destPath)
      } else {
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath)
        }
      }
    }
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  getToday() {
    return new Date().toISOString().split('T')[0]
  }

  /**
   * Get yesterday's date in YYYY-MM-DD format
   */
  getYesterday() {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }

  /**
   * Get path to daily memory file
   */
  getDailyPath(date) {
    return path.join(this.memoryDir, `${date}.md`)
  }

  /**
   * Get path to curated memory file
   */
  getMemoryPath() {
    return path.join(this.memoryDir, 'MEMORY.md')
  }

  /**
   * Read a file safely
   */
  readFile(filepath) {
    try {
      if (fs.existsSync(filepath)) {
        return fs.readFileSync(filepath, 'utf-8')
      }
    } catch (err) {
      console.error(`[Memory] Failed to read ${filepath}:`, err.message)
    }
    return null
  }

  /**
   * Write to a file
   */
  writeFile(filepath, content) {
    try {
      fs.writeFileSync(filepath, content, 'utf-8')
      return true
    } catch (err) {
      console.error(`[Memory] Failed to write ${filepath}:`, err.message)
      return false
    }
  }

  /**
   * Append to a file
   */
  appendFile(filepath, content) {
    try {
      fs.appendFileSync(filepath, content, 'utf-8')
      return true
    } catch (err) {
      console.error(`[Memory] Failed to append to ${filepath}:`, err.message)
      return false
    }
  }

  /**
   * Read today's daily memory
   */
  readTodayMemory() {
    return this.readFile(this.getDailyPath(this.getToday()))
  }

  /**
   * Read yesterday's daily memory
   */
  readYesterdayMemory() {
    return this.readFile(this.getDailyPath(this.getYesterday()))
  }

  /**
   * Read curated long-term memory
   */
  readLongTermMemory() {
    return this.readFile(this.getMemoryPath())
  }

  /**
   * Append to today's daily memory
   */
  appendToDailyMemory(content) {
    const filepath = this.getDailyPath(this.getToday())
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    const entry = `\n## ${timestamp}\n${content}\n`
    return this.appendFile(filepath, entry)
  }

  /**
   * Append to curated long-term memory
   */
  appendToLongTermMemory(content) {
    const filepath = this.getMemoryPath()
    const timestamp = new Date().toISOString().split('T')[0]
    const entry = `\n## ${timestamp}\n${content}\n`
    return this.appendFile(filepath, entry)
  }

  /**
   * Get all memory context for session start
   */
  getMemoryContext() {
    const parts = []

    const longTerm = this.readLongTermMemory()
    if (longTerm) {
      parts.push(`## Long-Term Memory (MEMORY.md)\n${longTerm}`)
    }

    const yesterday = this.readYesterdayMemory()
    if (yesterday) {
      parts.push(`## Yesterday's Notes (${this.getYesterday()})\n${yesterday}`)
    }

    const today = this.readTodayMemory()
    if (today) {
      parts.push(`## Today's Notes (${this.getToday()})\n${today}`)
    }

    return parts.join('\n\n---\n\n')
  }

  /**
   * List all daily memory files
   */
  listDailyFiles() {
    try {
      return fs.readdirSync(this.memoryDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
    } catch (err) {
      return []
    }
  }

  /**
   * Search memory files for a query (simple text search)
   */
  searchMemory(query) {
    const results = []
    const queryLower = query.toLowerCase()

    // Search long-term memory
    const longTerm = this.readLongTermMemory()
    if (longTerm && longTerm.toLowerCase().includes(queryLower)) {
      results.push({
        file: 'MEMORY.md',
        matches: this.extractMatches(longTerm, query)
      })
    }

    // Search daily files
    for (const file of this.listDailyFiles().slice(0, 30)) { // Last 30 days
      const content = this.readFile(path.join(this.memoryDir, file))
      if (content && content.toLowerCase().includes(queryLower)) {
        results.push({
          file: `Memory/${file}`,
          matches: this.extractMatches(content, query)
        })
      }
    }

    return results
  }

  /**
   * Extract matching lines from content
   */
  extractMatches(content, query) {
    const lines = content.split('\n')
    const queryLower = query.toLowerCase()
    const matches = []

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        // Include context (line before and after)
        const start = Math.max(0, i - 1)
        const end = Math.min(lines.length, i + 2)
        matches.push({
          line: i + 1,
          context: lines.slice(start, end).join('\n')
        })
      }
    }

    return matches.slice(0, 5) // Limit to 5 matches per file
  }
}
