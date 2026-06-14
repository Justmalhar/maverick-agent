import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const BRAVE_API = 'https://api.search.brave.com/res/v1'

function getHeaders() {
  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) {
    throw new Error('BRAVE_API_KEY environment variable is not set')
  }
  return {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
    'X-Subscription-Token': apiKey
  }
}

async function braveFetch(endpoint, params = {}) {
  const url = new URL(`${BRAVE_API}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url.toString(), {
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(`Brave API error (${response.status}): ${error.message || response.statusText}`)
  }

  return response.json()
}

export function createSearchMcpServer() {
  if (!process.env.BRAVE_API_KEY) {
    console.log('[Search] BRAVE_API_KEY not set, search tools disabled')
    return null
  }

  console.log('[Search] Tools enabled')

  return createSdkMcpServer({
    name: 'brave-search',
    version: '1.0.0',
    tools: [
      tool(
        'web_search',
        'Search the web using Brave Search. Returns titles, URLs, descriptions, and age of results.',
        {
          query: z.string().describe('Search query'),
          count: z.number().optional().describe('Number of results (1-20, default 10)'),
          offset: z.number().optional().describe('Result offset for pagination (default 0)'),
          country: z.string().optional().describe('Country code (e.g., "US", "GB", "IN")'),
          search_lang: z.string().optional().describe('Search language (e.g., "en", "es")'),
          freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional().describe('Freshness filter: pd=past day, pw=past week, pm=past month, py=past year')
        },
        async ({ query, count, offset, country, search_lang, freshness }) => {
          const data = await braveFetch('/web/search', {
            q: query,
            count,
            offset,
            country,
            search_lang,
            freshness
          })

          const results = (data.web?.results || []).map(r => ({
            title: r.title,
            url: r.url,
            description: r.description,
            age: r.age
          }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                total_results: data.web?.results?.length || 0,
                results
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'news_search',
        'Search news using Brave Search. Returns titles, URLs, descriptions, age, and sources.',
        {
          query: z.string().describe('Search query'),
          count: z.number().optional().describe('Number of results (1-20, default 10)'),
          offset: z.number().optional().describe('Result offset for pagination (default 0)'),
          country: z.string().optional().describe('Country code (e.g., "US", "GB", "IN")'),
          search_lang: z.string().optional().describe('Search language (e.g., "en", "es")'),
          freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional().describe('Freshness filter: pd=past day, pw=past week, pm=past month, py=past year')
        },
        async ({ query, count, offset, country, search_lang, freshness }) => {
          const data = await braveFetch('/news/search', {
            q: query,
            count,
            offset,
            country,
            search_lang,
            freshness
          })

          const results = (data.results || []).map(r => ({
            title: r.title,
            url: r.url,
            description: r.description,
            age: r.age,
            source: r.meta_url?.hostname
          }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                total_results: data.results?.length || 0,
                results
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'image_search',
        'Search images using Brave Search. Returns titles, URLs, source URLs, and thumbnails.',
        {
          query: z.string().describe('Search query'),
          count: z.number().optional().describe('Number of results (1-20, default 10)'),
          offset: z.number().optional().describe('Result offset for pagination (default 0)'),
          country: z.string().optional().describe('Country code (e.g., "US", "GB", "IN")'),
          search_lang: z.string().optional().describe('Search language (e.g., "en", "es")'),
          freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional().describe('Freshness filter: pd=past day, pw=past week, pm=past month, py=past year')
        },
        async ({ query, count, offset, country, search_lang, freshness }) => {
          const data = await braveFetch('/images/search', {
            q: query,
            count,
            offset,
            country,
            search_lang,
            freshness
          })

          const results = (data.results || []).map(r => ({
            title: r.title,
            url: r.url,
            source_url: r.properties?.url,
            thumbnail: r.thumbnail?.src
          }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                total_results: data.results?.length || 0,
                results
              }, null, 2)
            }]
          }
        }
      ),

      tool(
        'video_search',
        'Search videos using Brave Search. Returns titles, URLs, descriptions, and age.',
        {
          query: z.string().describe('Search query'),
          count: z.number().optional().describe('Number of results (1-20, default 10)'),
          offset: z.number().optional().describe('Result offset for pagination (default 0)'),
          country: z.string().optional().describe('Country code (e.g., "US", "GB", "IN")'),
          search_lang: z.string().optional().describe('Search language (e.g., "en", "es")'),
          freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional().describe('Freshness filter: pd=past day, pw=past week, pm=past month, py=past year')
        },
        async ({ query, count, offset, country, search_lang, freshness }) => {
          const data = await braveFetch('/videos/search', {
            q: query,
            count,
            offset,
            country,
            search_lang,
            freshness
          })

          const results = (data.results || []).map(r => ({
            title: r.title,
            url: r.url,
            description: r.description,
            age: r.age
          }))

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                total_results: data.results?.length || 0,
                results
              }, null, 2)
            }]
          }
        }
      )
    ]
  })
}
