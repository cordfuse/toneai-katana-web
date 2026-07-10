// Tavily web search wrapper, exposed to the LLM as a tool. Used only when
// the operator has TAVILY_API_KEY set AND the user has flipped the search
// toggle on for the current conversation.

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  answer?: string  // Tavily's auto-generated short answer (when basic_advanced)
}

// The OpenAI-shaped tool definition we pass to token.js. Cross-provider —
// token.js converts to each provider's native format (Anthropic, OpenAI,
// Gemini, etc.) at dispatch time.
export const WEB_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description:
      'Search the web for current information. Use for facts that may have changed since training, ' +
      'news, current events, or anything requiring up-to-date knowledge. Returns ranked results with snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query — be specific and concise.',
        },
        max_results: {
          type: 'number',
          description: 'Number of results to return (1-10). Default 5.',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    },
  },
}

export function isWebSearchAvailable(): boolean {
  // This app is Anthropic, which has native web search (resolveSearch wires
  // anthropic.tools.webSearch) — available on both the free server key and
  // BYOK, no Tavily needed. A Tavily key is an alternative backend, not a
  // requirement, so search is always offered here.
  return true
}

export async function tavilySearch(
  query: string,
  maxResults: number = 5,
): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY not set on server')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.min(Math.max(maxResults, 1), 10),
      search_depth: 'basic',
      include_answer: true,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Tavily ${res.status}: ${errBody.slice(0, 200)}`)
  }
  const data = await res.json()
  const results: SearchResult[] = Array.isArray(data?.results)
    ? data.results.map((r: { title?: string; url?: string; content?: string }) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
      }))
    : []
  return { query, results, answer: data?.answer ?? undefined }
}

// Execute a tool call by name and return its serialized result, ready to
// feed back to the model as a `tool` message.
export async function executeToolCall(name: string, argsJson: string): Promise<string> {
  if (name !== 'web_search') {
    return JSON.stringify({ error: `Unknown tool '${name}'` })
  }
  let args: { query?: string; max_results?: number }
  try {
    args = JSON.parse(argsJson || '{}')
  } catch {
    return JSON.stringify({ error: 'Invalid arguments JSON' })
  }
  if (typeof args.query !== 'string' || args.query.length === 0) {
    return JSON.stringify({ error: 'Missing required argument: query' })
  }
  try {
    const out = await tavilySearch(args.query, args.max_results ?? 5)
    return JSON.stringify(out)
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Search failed' })
  }
}
