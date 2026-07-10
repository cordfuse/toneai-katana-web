import { v4 as uuidv4 } from 'uuid'
import type { Message, TonePatchResult } from './types'
import { clog, getClientLog } from './log/client'
import type { LogEntry } from './log/types'

// OpenAI-style multimodal content. Used for messages that include images.
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface MultimodalMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface ChatResponse {
  message: string
  sources?: { title: string; url: string }[]
}

const BASE = '/api'

function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('device_id')
  if (!id) { id = uuidv4(); localStorage.setItem('device_id', id) }
  return id
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function setToken(token: string) {
  localStorage.setItem('auth_token', token)
}

async function authenticate(): Promise<void> {
  const res = await fetch(`${BASE}/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId() }),
  })
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
  const data = await res.json()
  setToken(data.token)
}

export async function initAuth(): Promise<void> {
  if (!getToken()) await authenticate()
}

// ─── Providers ───────────────────────────────────────────────────────────────

export interface ProviderModel {
  id: string
  label: string
}

export interface AvailableProvider {
  id: string
  label: string
  category: 'cloud' | 'local'
  available: boolean
  defaultModel: string
  models: ProviderModel[]
}

export interface ProvidersResponse {
  providers: AvailableProvider[]
  features: { webSearch: boolean }
}

export async function getProviders(): Promise<ProvidersResponse> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }
  const res = await fetch(`${BASE}/providers`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return getProviders()
  }
  if (!res.ok) throw new Error(`Providers fetch failed: ${res.status}`)
  const data = await res.json()
  return {
    providers: data.providers ?? [],
    features: data.features ?? { webSearch: false },
  }
}

// ─── Free-tier quota ─────────────────────────────────────────────────────────

export interface QuotaResult {
  remaining: number
  limit: number
  /** ISO timestamp of the next UTC midnight, when the pool refills. */
  resetsAt: string
}

/**
 * Global free-tier counter. Unauthenticated by design — it exposes only an
 * aggregate count, and the pill needs it before the first chat request.
 */
export async function getQuota(): Promise<QuotaResult> {
  const res = await fetch(`${BASE}/quota`)
  if (!res.ok) throw new Error(`Quota fetch failed: ${res.status}`)
  return res.json()
}

// ─── MCP servers ─────────────────────────────────────────────────────────────

export interface AvailableMcpServer {
  id: string
  label: string
  toolCount: number
  available: boolean
  error: string | null
}

export async function getMcpServers(): Promise<AvailableMcpServer[]> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }
  const res = await fetch(`${BASE}/mcps`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return getMcpServers()
  }
  if (!res.ok) return []
  const data = await res.json()
  return data.servers ?? []
}

export interface ProviderModelsResult {
  models: ProviderModel[]
  source: 'live' | 'registry'
}

// For local providers this probes the local server's /v1/models endpoint
// and returns whatever's installed. For cloud providers returns the
// curated registry list.
export async function extractDocument(name: string, mimeType: string, dataBase64: string): Promise<string> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }
  const res = await fetch(`${BASE}/extract-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, mimeType, dataBase64 }),
  })
  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return extractDocument(name, mimeType, dataBase64)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `Extraction failed: ${res.status}`)
  return data.text ?? ''
}

export async function getProviderModels(providerId: string): Promise<ProviderModelsResult> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }
  const res = await fetch(`${BASE}/providers/${encodeURIComponent(providerId)}/models`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return getProviderModels(providerId)
  }
  if (!res.ok) throw new Error(`Models fetch failed: ${res.status}`)
  const data = await res.json()
  return { models: data.models ?? [], source: data.source ?? 'registry' }
}

// ─── Diagnostic log ──────────────────────────────────────────────────────────

/** Fetch this device's server-side log entries (JWT-scoped). Never throws. */
export async function fetchServerLog(): Promise<LogEntry[]> {
  try {
    let token = getToken()
    if (!token) { await authenticate(); token = getToken()! }
    const res = await fetch(`${BASE}/logs`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.entries) ? (data.entries as LogEntry[]) : []
  } catch {
    return []
  }
}

/**
 * Build the merged client+server diagnostic log and trigger a browser download.
 * Client and server entries are unioned and sorted by timestamp into one plain
 * .txt file (one JSON object per line) — the single artifact a user sends when
 * reporting an issue.
 */
export async function downloadDiagnostics(): Promise<void> {
  const [server, client] = [await fetchServerLog(), getClientLog()]
  const merged = [...client, ...server].sort((a, b) => a.ts - b.ts)
  const text = merged.map((e) => JSON.stringify(e)).join('\n') + '\n'
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  a.href = url
  a.download = `toneai-log-${stamp}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface ChatOpts {
  provider?: string
  model?: string
  webSearch?: boolean
  mcpServers?: string[]
  systemPrompt?: string
  temperature?: number
  /** Target KATANA device id — which generation's patch to write. */
  device?: string
  /** The player's rig descriptor (e.g. "Les Paul, bridge humbucker"). */
  rig?: string
  /**
   * BYOK. Sent as the `x-anthropic-key` request header (not in the body, so
   * it never lands in a request-body log). Its presence is what switches the
   * server off the free-tier quota — there is no separate mode flag.
   */
  apiKey?: string | null
}

/** Header map for a /chat call: auth + JSON + correlation id + BYOK key. */
function chatHeaders(token: string, apiKey?: string | null, requestId?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (requestId) h['x-request-id'] = requestId
  if (apiKey) h['x-anthropic-key'] = apiKey
  return h
}

/** Last user turn's text, for the client-side request log. Image blocks dropped. */
function lastPrompt(messages: Message[] | MultimodalMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown }
    if (m?.role !== 'user') continue
    if (typeof m.content === 'string') return m.content.slice(0, 500)
    if (Array.isArray(m.content)) {
      return (m.content as ContentBlock[])
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text?: string }).text ?? '')
        .join(' ').trim().slice(0, 500)
    }
    return undefined
  }
  return undefined
}

// Events the streaming chat endpoint can emit (beyond plain text deltas).
export interface StreamHooks {
  onToolRunning?: (info: { name: string; query?: string }) => void
  onSources?: (sources: { title: string; url: string }[]) => void
  onTonePatch?: (tone: TonePatchResult) => void
}

export async function sendChat(messages: Message[] | MultimodalMessage[], signal?: AbortSignal, opts: ChatOpts = {}): Promise<ChatResponse> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }

  // apiKey travels as a header, never in the body — keep it out of the spread.
  const { apiKey, ...bodyOpts } = opts
  const requestId = uuidv4()
  const startedAt = Date.now()
  clog('info', 'chat.request', lastPrompt(messages), {
    device: opts.device, model: opts.model, webSearch: opts.webSearch, byok: !!apiKey, stream: false,
  }, requestId)

  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    signal,
    headers: chatHeaders(token, apiKey, requestId),
    body: JSON.stringify({ messages, ...bodyOpts }),
  })

  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return sendChat(messages, signal, opts)
  }

  if (!res.ok) {
    let message = `Server error ${res.status}`
    try {
      const body = await res.json()
      if (body?.error && typeof body.error === 'string') message = body.error
    } catch { /* ignore parse errors */ }
    clog('error', 'chat.error', message, { status: res.status, ms: Date.now() - startedAt }, requestId)
    throw new Error(message)
  }

  const data = await res.json()
  clog('info', 'chat.response', undefined, {
    chars: (data.message ?? '').length, sources: data.sources?.length ?? 0, ms: Date.now() - startedAt,
  }, requestId)
  return {
    message: data.message ?? '',
    sources: data.sources,
  }
}

export async function sendChatStream(
  messages: Message[] | MultimodalMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  opts: ChatOpts = {},
  hooks: StreamHooks = {},
): Promise<ChatResponse> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }

  // apiKey travels as a header, never in the body — keep it out of the spread.
  const { apiKey, ...bodyOpts } = opts
  const requestId = uuidv4()
  const startedAt = Date.now()
  clog('info', 'chat.request', lastPrompt(messages), {
    device: opts.device, model: opts.model, webSearch: opts.webSearch, byok: !!apiKey, stream: true,
  }, requestId)

  // Capture the generated tone's name for the response log without disturbing
  // the caller's hook.
  let toneName: string | undefined
  const wrappedHooks: StreamHooks = {
    ...hooks,
    onTonePatch: (tone) => {
      toneName = (tone as { patch?: { name?: string }; name?: string }).patch?.name
        ?? (tone as { name?: string }).name ?? toneName
      hooks.onTonePatch?.(tone)
    },
  }

  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    signal,
    headers: chatHeaders(token, apiKey, requestId),
    body: JSON.stringify({ messages, stream: true, ...bodyOpts }),
  })

  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return sendChatStream(messages, onDelta, signal, opts, hooks)
  }

  if (!res.ok || !res.body) {
    let message = `Server error ${res.status}`
    try {
      const body = await res.json()
      if (body?.error && typeof body.error === 'string') message = body.error
    } catch { /* ignore parse errors */ }
    clog('error', 'chat.error', message, { status: res.status, ms: Date.now() - startedAt }, requestId)
    throw new Error(message)
  }

  // Stream id lets us reconnect via /api/chat/replay/[id] with Last-Event-ID
  // if the read drops mid-flight (e.g. mobile tab backgrounded). The server
  // sets this header on POST.
  const streamId = res.headers.get('X-Chatframe-Stream-Id') ?? ''

  try {
    const result = await drainStream(res.body, streamId, 0, signal, token, onDelta, wrappedHooks)
    clog('info', 'chat.response', toneName ? `tone: ${toneName}` : undefined, {
      chars: result.message.length, sources: result.sources?.length ?? 0, tone: toneName, ms: Date.now() - startedAt,
    }, requestId)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // A user-initiated abort is not a failure worth flagging as an error.
    const level = err instanceof Error && err.name === 'AbortError' ? 'info' : 'error'
    clog(level, level === 'error' ? 'chat.error' : 'chat.aborted', message, { ms: Date.now() - startedAt }, requestId)
    throw err
  }
}

// Reads SSE events from a ReadableStream, returns the assembled message + any
// sources. Tracks the highest event id seen so a reconnect can resume exactly
// after it. If the read fails mid-stream AND we have a streamId, reconnects to
// /api/chat/replay/[id] with Last-Event-ID and keeps draining. Recursive
// (each reconnect calls drainStream again with the latest state).
async function drainStream(
  body: ReadableStream<Uint8Array>,
  streamId: string,
  startingLastId: number,
  signal: AbortSignal | undefined,
  token: string,
  onDelta: (text: string) => void,
  hooks: StreamHooks,
  carryAccumulated = '',
  carrySources: { title: string; url: string }[] = [],
): Promise<ChatResponse> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let accumulated = carryAccumulated
  const accumulatedSources = carrySources
  let lastEventId = startingLastId

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const evt = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        // SSE event can have `id: N\n` followed by `data: ...`. We parse both
        // fields, update lastEventId for the next reconnect, then dispatch the
        // JSON payload.
        let payload: string | null = null
        for (const line of evt.split('\n')) {
          if (line.startsWith('id: ')) {
            const n = parseInt(line.slice(4), 10)
            if (Number.isFinite(n)) lastEventId = n
          } else if (line.startsWith('data: ')) {
            payload = line.slice(6)
          }
        }
        if (!payload) continue
        let obj: {
          type: string
          content?: string
          message?: string
          name?: string
          query?: string
          sources?: { title: string; url: string }[]
        }
        try {
          obj = JSON.parse(payload)
        } catch {
          continue
        }
        if (obj.type === 'delta' && obj.content) {
          accumulated += obj.content
          onDelta(obj.content)
        } else if (obj.type === 'tool_running' && obj.name) {
          hooks.onToolRunning?.({ name: obj.name, query: obj.query })
        } else if (obj.type === 'sources' && Array.isArray(obj.sources)) {
          for (const s of obj.sources) accumulatedSources.push(s)
          hooks.onSources?.(obj.sources)
        } else if (obj.type === 'tone_patch' && (obj as { patch?: unknown }).patch) {
          hooks.onTonePatch?.(obj as unknown as TonePatchResult)
        } else if (obj.type === 'error') {
          throw new Error(obj.message ?? 'Stream error')
        }
      }
    }
  } catch (err) {
    // User-initiated cancel never reconnects.
    if (err instanceof Error && err.name === 'AbortError') throw err
    // No streamId → first POST never gave us one (older server, or POST
    // failed before headers). Can't reconnect.
    if (!streamId) throw err

    // Attempt one reconnect. The replay endpoint resumes from lastEventId+1
    // onwards, including any events that arrived while we were reading.
    console.warn(`[chat] reader dropped at id=${lastEventId}; reconnecting via replay`)
    const replayRes = await fetch(`${BASE}/chat/replay/${encodeURIComponent(streamId)}`, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Last-Event-ID': String(lastEventId),
      },
    })
    if (!replayRes.ok || !replayRes.body) {
      // 404 means the stream is gone (TTL expired or never existed). Surface
      // the original error rather than a confusing "Stream not found".
      throw err
    }
    return drainStream(replayRes.body, streamId, lastEventId, signal, token, onDelta, hooks, accumulated, accumulatedSources)
  }

  return { message: accumulated, sources: accumulatedSources.length ? accumulatedSources : undefined }
}
