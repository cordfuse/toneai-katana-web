import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { checkAndIncrementQuota } from '@/lib/server/quota'
import {
  runChat, runChatStream, findProvider, isModelValidForProvider,
} from '@/lib/server/ai-tools'
import { loadToneaiConfig } from '@/lib/config'
import { createStream, attachReplay } from '@/lib/server/stream-buffer'
import { resolveLocalizableString, languageNameForLocale } from '@/lib/i18n'
import { resolveLocale } from '@/lib/i18n/server'
import { katanaSystemPrompt, type ToneContext } from '@/lib/server/tone'
import { KATANA_DEVICES, type KatanaDevice } from '@/lib/storage'
import { slog } from '@/lib/server/log'
import { DEFAULT_MODEL } from '@/lib/server/models'

const DEFAULT_DEVICE: KatanaDevice = 'katana-100-mk2'

// A short, safe summary of the user's prompt for the diagnostic log — the last
// user turn's text only (image blocks stripped), truncated. Never the raw
// message array (which can carry base64 image data).
function promptSummary(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'user') continue
    const c = m.content
    if (typeof c === 'string') return c.slice(0, 500)
    if (Array.isArray(c)) {
      const text = c.filter((b: unknown) => (b as { type?: string })?.type === 'text')
        .map((b: unknown) => (b as { text?: string }).text ?? '').join(' ').trim()
      return text.slice(0, 500)
    }
    return undefined
  }
  return undefined
}

// Resolve the tone context from the request: which KATANA to write for and the
// player's rig descriptor. Falls back to the default device on anything unknown.
function resolveToneContext(rawDevice: unknown, rawRig: unknown): ToneContext {
  const device = KATANA_DEVICES.find(d => d.id === rawDevice)?.id ?? DEFAULT_DEVICE
  const deviceLabel = KATANA_DEVICES.find(d => d.id === device)?.label ?? 'KATANA'
  const rig = typeof rawRig === 'string' && rawRig.trim() ? rawRig.trim() : undefined
  return { device, deviceLabel, rig }
}

export const maxDuration = 300

const ENV_PROVIDER = 'anthropic'
// The default chat model — env-driven (TONEAI_MODEL), Sonnet by default.
// Same source the provider registry uses, so client and server agree.
const ENV_MODEL = DEFAULT_MODEL

// Auto-append a one-line language instruction so the model knows to
// respond in the user's chosen UI language. English is the no-op default
// since most system prompts and model defaults already use English.
// Operator can opt out by setting TONEAI_LOCALE_HINT=0 (mostly useful
// during testing or for prompts that already handle this).
function applyLocaleHint(systemPrompt: string, locale: string): string {
  if (locale === 'en') return systemPrompt
  if (process.env.TONEAI_LOCALE_HINT === '0') return systemPrompt
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
  return envNumber('TONEAI_TEMPERATURE') ?? HARDCODED_TEMPERATURE
}
export async function POST(request: NextRequest) {
  console.log('[chat] request received')
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) {
    console.log('[chat] unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Correlation id from the client ties this server handling to the client-side
  // log entries for the same request. startedAt drives request latency.
  const requestId = request.headers.get('x-request-id') ?? undefined
  const startedAt = Date.now()

  const body = await request.json()
  const {
    messages, stream: wantStream,
    provider: clientProvider, model: clientModel,
    webSearch,
    temperature: clientTemperature,
    device: clientDevice,
    rig: clientRig,
  } = body

  // BYOK. The mode is DERIVED from the presence of a key — there is no mode
  // flag to drift out of sync. This value is a transient credential: it is
  // passed to the SDK and dropped. Never log it, never persist it, and never
  // let it reach an error response (see the catch blocks below).
  const rawKey = request.headers.get('x-anthropic-key')
  const byokKey = typeof rawKey === 'string' && rawKey.trim().length > 0 ? rawKey.trim() : undefined

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

  // Free mode needs the server's key. BYOK brings its own, so the server's
  // key being absent is not an error on that path.
  if (!byokKey && providerInfo.category === 'cloud') {
    const requiredKey = providerInfo.envKey
    if (requiredKey && !process.env[requiredKey]) {
      return NextResponse.json({
        error: `Service unavailable — ${requiredKey} not set for provider '${providerId}'.`,
      }, { status: 503 })
    }
  }

  // Quota: free mode only, a single shared daily pool. BYOK bypasses it (it
  // costs us no tokens).
  if (!byokKey) {
    const quota = checkAndIncrementQuota()
    if (!quota.allowed) {
      const error = "Today's free requests have all been used, shared across everyone. Add your own Anthropic API key in Settings to keep going, or come back tomorrow."
      return NextResponse.json({ error, remaining: quota.remaining }, { status: 429 })
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

  // Web search honors the client toggle. It runs through Anthropic's native
  // web-search tool (resolveSearch wires it for the anthropic provider), so
  // no extra key or backend is involved.
  const wantWebSearch = !!webSearch

  // Resolve the active UI locale from the toneai_locale cookie so the
  // system prompt picks up its localized variant AND we can auto-append
  // a "Respond in <language>." instruction. Falls back to the deploy
  // default (TONEAI_LOCALE env, then 'en').
  const { localeCodes, defaultLocale } = loadToneaiConfig()
  const activeLocale = await resolveLocale(localeCodes, defaultLocale)
  // The tone-designer prompt + schema are the product and stay server-side; the
  // client cannot override them (docs/settings.md § Inference is server-side).
  const toneCtx = resolveToneContext(clientDevice, clientRig)
  const systemPrompt = applyLocaleHint(katanaSystemPrompt(toneCtx), activeLocale)
  const temperature  = resolveTemperature(clientTemperature)
  const runOpts = { webSearch: wantWebSearch, temperature, apiKey: byokKey, tone: toneCtx }

  console.log(`[chat] msgs=${messages.length} provider=${provider} model=${model} stream=${!!wantStream} websearch=${wantWebSearch} temp=${temperature} locale=${activeLocale}`)

  slog(deviceId, requestId, 'info', 'chat.request', promptSummary(messages), {
    provider, model, stream: !!wantStream, webSearch: wantWebSearch,
    device: toneCtx.device, rig: toneCtx.rig, byok: !!byokKey,
    msgCount: messages.length, locale: activeLocale,
  })

  if (wantStream) {
    // Decoupled streaming with replay buffer.
    //
    // Two concerns to separate:
    //   1. The LLM run must keep going even if the client disconnects
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
      let tone: string | undefined
      let chars = 0
      try {
        for await (const event of runChatStream(messages, provider, model, systemPrompt, runOpts)) {
          const e = event as { type?: string; content?: string; patch?: { name?: string }; name?: string }
          if (e?.type === 'delta' && typeof e.content === 'string') chars += e.content.length
          if (e?.type === 'tone_patch') tone = e.patch?.name ?? e.name ?? tone
          push(`data: ${JSON.stringify(event)}\n\n`)
        }
        push(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        console.log(`[chat] stream ${streamId} done`)
        slog(deviceId, requestId, 'info', 'chat.response', tone ? `tone: ${tone}` : undefined, {
          ms: Date.now() - startedAt, chars, tone, stream: true,
        })
      } catch (err) {
        console.error(`[chat] stream ${streamId} error:`, err)
        slog(deviceId, requestId, 'error', 'chat.error', friendlyError(err), {
          ms: Date.now() - startedAt, stream: true,
        })
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
        'X-Toneai-Stream-Id':  streamId,
      },
    })
  }

  try {
    const result = await runChat(messages, provider, model, systemPrompt, runOpts)
    console.log('[chat] done')
    const r = result as { message?: string; patch?: { name?: string } }
    slog(deviceId, requestId, 'info', 'chat.response', undefined, {
      ms: Date.now() - startedAt, chars: r.message?.length ?? 0, tone: r.patch?.name, stream: false,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[chat] error:', err)
    slog(deviceId, requestId, 'error', 'chat.error', friendlyError(err), {
      ms: Date.now() - startedAt, stream: false,
    })
    return NextResponse.json({ error: friendlyError(err) }, { status: 500 })
  }
}
