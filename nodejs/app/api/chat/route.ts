import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import {
  runChat, runChatStream, findProvider, isModelValidForProvider,
} from '@/lib/server/ai-tools'
import { loadChatframeConfig } from '@/lib/config'
import { listServers } from '@/lib/server/mcp'
import { createStream, attachReplay } from '@/lib/server/stream-buffer'
import { resolveLocalizableString, languageNameForLocale } from '@/lib/i18n'
import { resolveLocale } from '@/lib/i18n/server'

export const maxDuration = 300

const ENV_PROVIDER = process.env.CHATFRAME_PROVIDER ?? 'anthropic'
const ENV_MODEL = process.env.CHATFRAME_MODEL ?? 'claude-sonnet-4-6'

// System prompt resolution chain: client per-request → CHATFRAME_SYSTEM_PROMPT
// env → chatframe.config.json defaultSystemPrompt → hardcoded fallback.
// Config is read fresh per request so drop-in JSON changes apply immediately.
// The chatframe.config.json value may be a per-locale map — resolved to the
// active locale's string before returning.
function getDefaultSystemPrompt(locale: string): string {
  if (process.env.CHATFRAME_SYSTEM_PROMPT) return process.env.CHATFRAME_SYSTEM_PROMPT
  const cfg = loadChatframeConfig().config
  return resolveLocalizableString(cfg.defaultSystemPrompt, locale)
}

// Auto-append a one-line language instruction so the model knows to
// respond in the user's chosen UI language. English is the no-op default
// since most system prompts and model defaults already use English.
// Operator can opt out by setting CHATFRAME_LOCALE_HINT=0 (mostly useful
// during testing or for prompts that already handle this).
function applyLocaleHint(systemPrompt: string, locale: string): string {
  if (locale === 'en') return systemPrompt
  if (process.env.CHATFRAME_LOCALE_HINT === '0') return systemPrompt
  const language = languageNameForLocale(locale)
  return `${systemPrompt}\n\nRespond in ${language} unless the user writes in a different language.`
}

// Generation defaults — env var (operator deploy default) → hardcoded fallback.
// Client may override per-request via the request body; resolveGen() applies
// request → env → hardcoded.
const HARDCODED_TEMPERATURE = 1.0
function envNumber(name: string): number | undefined {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}
function resolveTemperature(clientValue: unknown): number {
  if (typeof clientValue === 'number' && Number.isFinite(clientValue)) return clientValue
  return envNumber('CHATFRAME_TEMPERATURE') ?? HARDCODED_TEMPERATURE
}
function resolveSystemPrompt(clientValue: unknown, locale: string): string {
  const base = (typeof clientValue === 'string' && clientValue.trim().length > 0)
    ? clientValue
    : getDefaultSystemPrompt(locale)
  return applyLocaleHint(base, locale)
}

export async function POST(request: NextRequest) {
  console.log('[chat] request received')
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) {
    console.log('[chat] unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    messages, stream: wantStream,
    provider: clientProvider, model: clientModel,
    webSearch,
    mcpServers: clientMcpServers,
    systemPrompt: clientSystemPrompt,
    temperature: clientTemperature,
  } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
  }


  // Provider: when picker is hidden, ignore client choice and use env default.
  // Otherwise, prefer client choice if valid, else env default.
  let providerId = ENV_PROVIDER
  if (true && typeof clientProvider === 'string') {
    if (!findProvider(clientProvider)) {
      return NextResponse.json({ error: `Unknown provider '${clientProvider}'` }, { status: 400 })
    }
    providerId = clientProvider
  }
  const providerInfo = findProvider(providerId)
  if (!providerInfo) {
    return NextResponse.json({ error: `Unknown provider '${providerId}'` }, { status: 400 })
  }

  // Model: when picker is hidden, ignore client choice. Otherwise prefer
  // client → env default (if matches) → provider's defaultModel from registry.
  let model: string
  if (true && typeof clientModel === 'string') {
    if (!isModelValidForProvider(providerId, clientModel)) {
      return NextResponse.json({
        error: `Model '${clientModel}' is not registered for provider '${providerId}'`,
      }, { status: 400 })
    }
    model = clientModel
  } else if (providerId === ENV_PROVIDER && isModelValidForProvider(providerId, ENV_MODEL)) {
    model = ENV_MODEL
  } else {
    model = providerInfo.defaultModel
  }

  // Cloud providers need an API key in the env. Local providers don't
  // (they hit a local OpenAI-compatible server with a sentinel apiKey).
  if (providerInfo.category === 'cloud') {
    const requiredKey = providerInfo.envKey
    if (requiredKey && !process.env[requiredKey]) {
      return NextResponse.json({
        error: `Service unavailable — ${requiredKey} not set for provider '${providerId}'.`,
      }, { status: 503 })
    }
  }

  const provider = providerId

  // Translate provider errors into actionable messages. ECONNREFUSED to a
  // local provider almost always means the operator's local server isn't
  // running (Ollama / llama.cpp / LM Studio). Surfacing "Connection error."
  // alone gives the user no clue what to fix.
  const friendlyError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err)
    const cause = (err as { cause?: { code?: string } })?.cause
    const isConnRefused = cause?.code === 'ECONNREFUSED' || /ECONNREFUSED|connection error|fetch failed/i.test(raw)
    if (isConnRefused && providerInfo.category === 'local') {
      const baseURL = providerInfo.defaultBaseURL
      const envHint = providerInfo.baseURLEnv ? ` (override with ${providerInfo.baseURLEnv})` : ''
      return `Couldn't reach ${providerInfo.label}${baseURL ? ` at ${baseURL}` : ''}. Is the server running?${envHint}`
    }
    // Model not installed on a local server (Ollama 404, llama.cpp similar).
    if (providerInfo.category === 'local' && /\b404\b|not found|no such model/i.test(raw)) {
      if (providerInfo.id === 'ollama') {
        return `Model '${model}' isn't installed on Ollama. Pull it with:  ollama pull ${model}`
      }
      return `Model '${model}' isn't loaded on ${providerInfo.label}. Load it on the server and retry.`
    }
    return raw || 'Internal server error'
  }

  // Web search: when toggle is hidden, force ON if TAVILY key is set
  // (otherwise silently off — no error, picker is hidden so user can't have
  // asked for it). When toggle is visible, honor the client flag.
  const hasTavily = !!process.env.TAVILY_API_KEY
  const wantWebSearch = true
    ? !!webSearch
    : hasTavily
  if (true && wantWebSearch && !hasTavily) {
    return NextResponse.json({
      error: 'Web search is on but TAVILY_API_KEY isn\'t set on the server.',
    }, { status: 503 })
  }

  // MCP: when picker is hidden, use every configured + available server.
  // When picker is visible, honor the client's selection.
  let mcpServers: string[]
  if (true) {
    mcpServers = Array.isArray(clientMcpServers)
      ? clientMcpServers.filter((s): s is string => typeof s === 'string')
      : []
  } else {
    const all = await listServers()
    mcpServers = all.filter(s => s.available).map(s => s.id)
  }

  // Resolve the active UI locale from the chatframe_locale cookie so the
  // system prompt picks up its localized variant AND we can auto-append
  // a "Respond in <language>." instruction. Falls back to the deploy
  // default (CHATFRAME_LOCALE env, then 'en').
  const { localeCodes, defaultLocale } = loadChatframeConfig()
  const activeLocale = await resolveLocale(localeCodes, defaultLocale)
  const systemPrompt = resolveSystemPrompt(clientSystemPrompt, activeLocale)
  const temperature  = resolveTemperature(clientTemperature)
  const runOpts = { webSearch: wantWebSearch, temperature, mcpServers }

  console.log(`[chat] msgs=${messages.length} provider=${provider} model=${model} stream=${!!wantStream} websearch=${wantWebSearch} mcps=${mcpServers.length ? mcpServers.join(',') : '-'} temp=${temperature} locale=${activeLocale}`)

  if (wantStream) {
    // Decoupled streaming with replay buffer.
    //
    // Two concerns to separate:
    //   1. The LLM/MCP run must keep going even if the client disconnects
    //      (so a backgrounded mobile tab can come back and finish reading).
    //   2. The HTTP response is just one consumer — there can be reconnects
    //      via /api/chat/replay/[id]?Last-Event-ID=N for the same stream.
    //
    // Architecture: createStream() returns push() + finish() into a process-
    // local buffer. A background promise runs the chat and pushes every event
    // (no awaiting from here — it outlives the request). The HTTP response is
    // a ReadableStream that subscribes to the buffer and tails live events.
    // The replay route does the same `attachReplay()` dance for reconnects.
    const { streamId, push, finish } = createStream()

    // Background run — keeps producing events even if the client is gone.
    // The buffer absorbs them; replay clients catch up via Last-Event-ID.
    void (async () => {
      try {
        for await (const event of runChatStream(messages, provider, model, systemPrompt, runOpts)) {
          push(`data: ${JSON.stringify(event)}\n\n`)
        }
        push(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        console.log(`[chat] stream ${streamId} done`)
      } catch (err) {
        console.error(`[chat] stream ${streamId} error:`, err)
        push(`data: ${JSON.stringify({ type: 'error', message: friendlyError(err) })}\n\n`)
      } finally {
        finish()
      }
    })()

    const enc = new TextEncoder()
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        const safeEnqueue = (chunk: Uint8Array): boolean => {
          if (closed) return false
          try { controller.enqueue(chunk); return true }
          catch { closed = true; return false }
        }

        // Heartbeat keeps the TCP socket warm so proxies/phones don't reap
        // it on idle. Doesn't go through the buffer — comments aren't
        // replayable content.
        const PING = enc.encode(': ping\n\n')
        const heartbeat = setInterval(() => {
          if (!safeEnqueue(PING)) clearInterval(heartbeat)
        }, 8000)

        // Replay anything already buffered (rare — we just created the
        // stream — but possible if the background loop got ahead).
        const handle = attachReplay(streamId, 0)!
        for (const e of handle.past) {
          if (!safeEnqueue(enc.encode(`id: ${e.id}\n${e.payload}`))) break
        }

        // If the background loop already finished (small/fast response),
        // close immediately.
        if (handle.done) {
          clearInterval(heartbeat)
          if (!closed) try { controller.close() } catch {}
          return
        }

        // Tail live events. Stops on first failed enqueue (client gone) or
        // when we observe the `done`/`error` event from the producer.
        const unsubscribe = handle.subscribe(e => {
          const ok = safeEnqueue(enc.encode(`id: ${e.id}\n${e.payload}`))
          const isTerminal = e.payload.includes('"type":"done"') || e.payload.includes('"type":"error"')
          if (!ok || isTerminal) {
            unsubscribe()
            clearInterval(heartbeat)
            if (!closed) try { controller.close() } catch {}
          }
        })
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type':       'text/event-stream',
        'Cache-Control':      'no-cache, no-transform',
        Connection:           'keep-alive',
        // The stream id lets the client reconnect to /api/chat/replay/[id]
        // with a Last-Event-ID header if the connection drops mid-flight.
        'X-Chatframe-Stream-Id':  streamId,
      },
    })
  }

  try {
    const result = await runChat(messages, provider, model, systemPrompt, runOpts)
    console.log('[chat] done')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[chat] error:', err)
    return NextResponse.json({ error: friendlyError(err) }, { status: 500 })
  }
}
