import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { checkAndIncrementQuota, refundQuota, FREE_DEVICE_DAILY_LIMIT, FREE_DAILY_LIMIT } from '@/lib/server/quota'
import { scrubString } from '@/lib/log/scrub'
import { describePatch, type TonePatch } from '@/lib/patch/intent'
import { mapProviderError } from '@/lib/server/provider-errors'
import {
  runChat, runChatStream, findProvider, isModelValidForProvider,
} from '@/lib/server/ai-tools'
import { loadToneaiConfig } from '@/lib/config'
import { createStream, attachReplay } from '@/lib/server/stream-buffer'
import { resolveLocalizableString, languageNameForLocale } from '@/lib/i18n'
import { resolveLocale } from '@/lib/i18n/server'
import { katanaSystemPrompt, type ToneContext } from '@/lib/server/tone'
import type { PickupNoise } from '@/lib/gear'
import {
  KATANA_DEVICES, type KatanaDevice, type PlayedInstrument,
  deviceInstrumentIssue, deviceInstrumentIssueMessage,
} from '@/lib/storage'
import { slog } from '@/lib/server/log'
import { DEFAULT_MODEL } from '@/lib/server/models'
import type { RequestUsage } from '@/lib/server/usage'

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

// Resolve the tone context from the request: which KATANA to write for, the
// instrument the player is holding, and their rig descriptor. The device is NOT
// defaulted — a missing/invalid/unsupported device is a hard error (validated by
// the caller via deviceInstrumentIssue), so the server never silently writes for
// an amp the user didn't choose.
function resolveToneContext(
  device: KatanaDevice, played: PlayedInstrument | undefined, rawRig: unknown,
  rawPickupNoise: unknown,
): ToneContext {
  const deviceLabel = KATANA_DEVICES.find(d => d.id === device)?.label ?? 'KATANA'
  const rig = typeof rawRig === 'string' && rawRig.trim() ? rawRig.trim() : undefined
  // Validated against the known set rather than trusted: an unknown value must fall
  // back to 'humbucking' (no gate correction), never to a made-up single coil, since
  // over-gating chops the player's quiet notes.
  const pickupNoise: PickupNoise | undefined =
    rawPickupNoise === 'single-coil' || rawPickupNoise === 'mixed' || rawPickupNoise === 'humbucking'
      ? rawPickupNoise
      : undefined
  return { device, deviceLabel, rig, instrument: played, pickupNoise }
}

/** The played-instrument kind from the request body, or undefined if absent. */
function parseInstrument(raw: unknown): PlayedInstrument | undefined {
  return raw === 'guitar' || raw === 'bass' ? raw : undefined
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

// Sampling temperature: operator dial only (TONEAI_TEMPERATURE → hardcoded).
// The client cannot override it — there is no UI for it and the body's value is
// not read.
const HARDCODED_TEMPERATURE = 1.0
function envNumber(name: string): number | undefined {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}
const TEMPERATURE = envNumber('TONEAI_TEMPERATURE') ?? HARDCODED_TEMPERATURE
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
    // note: `provider` and `model` in the body are ignored on purpose (see below)
    webSearch,
    device: clientDevice,
    rig: clientRig,
    instrument: clientInstrument,
    pickupNoise: clientPickupNoise,
  } = body

  // BYOK. The mode is DERIVED from the presence of a key — there is no mode
  // flag to drift out of sync. This value is a transient credential: it is
  // passed to the SDK and dropped. Never log it, never persist it, and never
  // let it reach an error response (see the catch blocks below).
  const rawKey = request.headers.get('x-anthropic-key')
  const byokKey = typeof rawKey === 'string' && rawKey.trim().length > 0 ? rawKey.trim() : undefined

  if (!Array.isArray(messages) || messages.length === 0) {
    console.log('[chat] rejected 400 reason=invalid_messages')
    slog(deviceId, requestId, 'warn', 'chat.rejected', 'invalid messages', {
      status: 400, reason: 'invalid_messages',
    })
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
  }

  // Device × instrument rule (lib/storage deviceInstrumentIssue). Checked BEFORE
  // provider/model/quota so a rejected combination never spends a free slot:
  //   • no valid amp selected → error (no silent default).
  //   • guitar played through a bass amp → error (bass amp can't voice a guitar).
  // A bass through a guitar amp, or no gear at all, is allowed and falls through.
  const device = KATANA_DEVICES.find(d => d.id === clientDevice && d.supported)?.id
  const playedInstrument = parseInstrument(clientInstrument)
  const deviceIssue = deviceInstrumentIssue(device, playedInstrument)
  if (deviceIssue) {
    // Worth counting: a spike here means the amp/instrument picker is confusing
    // people, not that users are doing something exotic.
    console.log(`[chat] rejected 400 reason=device_instrument issue=${deviceIssue} device=${clientDevice ?? 'none'} instrument=${playedInstrument ?? 'none'}`)
    slog(deviceId, requestId, 'warn', 'chat.rejected', deviceInstrumentIssueMessage(deviceIssue), {
      status: 400, reason: 'device_instrument', issue: deviceIssue,
      device: clientDevice, instrument: playedInstrument,
    })
    return NextResponse.json({ error: deviceInstrumentIssueMessage(deviceIssue) }, { status: 400 })
  }


  // Provider: fixed. Like the model, it is not the client's to choose — the
  // registry holds exactly one entry (Anthropic). The body's `provider` is
  // ignored; the `if (SHOW_PROVIDER_PICKER && ...)` guard that used to honour it
  // had already collapsed to `if (true && ...)`.
  const providerId = ENV_PROVIDER
  const providerInfo = findProvider(providerId)
  if (!providerInfo) {
    // Only reachable if config/providers.yaml is misconfigured — an operator
    // error at deploy time, not something a caller can trigger. Which is exactly
    // why it's logged at error level: it means the deploy is broken for everyone.
    console.error(`[chat] rejected 500 reason=unknown_provider provider=${providerId} — config/providers.yaml is misconfigured; the app is broken for every user.`)
    slog(deviceId, requestId, 'error', 'chat.rejected', `unknown provider '${providerId}'`, {
      status: 500, reason: 'unknown_provider', provider: providerId,
    })
    return NextResponse.json({ error: `Unknown provider '${providerId}'` }, { status: 500 })
  }

  // Model. WHO PAYS DECIDES.
  //
  // FREE TIER — a server decision, never the client's. The model spends the
  // operator's key, so a client-supplied `model` would let any caller pick an
  // expensive one (Opus is ~5x Haiku per token) and bill it to us. The body's
  // `model` is ignored outright on this path. Operators choose via TONEAI_MODEL.
  //
  // BYOK — the caller's own key pays for the tokens, so the choice is genuinely
  // theirs and costs us nothing. This is the whole point of bringing a key: the
  // free tier runs Haiku for cost reasons, and someone who wants Opus-grade tone
  // reasoning should be able to buy it. Still validated against
  // config/providers.yaml, which is the allow-list — an unknown or malformed
  // model id falls back to the server default rather than being passed through
  // to the provider.
  const serverModel: string =
    providerId === ENV_PROVIDER && isModelValidForProvider(providerId, ENV_MODEL)
      ? ENV_MODEL
      : providerInfo.defaultModel

  const requestedModel = typeof body.model === 'string' ? body.model : undefined
  const userPickedModel = !!byokKey && !!requestedModel && isModelValidForProvider(providerId, requestedModel)
  const model: string = userPickedModel ? requestedModel! : serverModel

  // WHOSE KEY, AND WHOSE CHOICE. Two independent facts, and the logs must carry
  // both or they mislead:
  //
  //   keyOwner   'server' → WE pay for this request. 'user' → their key pays, and
  //              the est$ on the cost line is THEIR bill, not ours. Without this,
  //              a BYOK Opus tone at ~$0.30 reads like a hole in our budget.
  //   modelPicker 'server' → our TONEAI_MODEL default. 'user' → they chose it in
  //              Settings. Distinguishes "our default is expensive" from "a user
  //              chose an expensive model", which are completely different
  //              problems with completely different fixes.
  const keyOwner: 'server' | 'user' = byokKey ? 'user' : 'server'
  const modelPicker: 'server' | 'user' = userPickedModel ? 'user' : 'server'

  // Free mode needs the server's key. BYOK brings its own, so the server's
  // key being absent is not an error on that path. Keep the message generic —
  // don't leak the internal env-var name to end users; guide them to BYOK.
  if (!byokKey && providerInfo.category === 'cloud') {
    const requiredKey = providerInfo.envKey
    if (requiredKey && !process.env[requiredKey]) {
      // THIS ONE IS AN ALARM, NOT A STATISTIC. It fires when the server's key is
      // missing — which, in production, means every free user is being turned away
      // right now. Previously this returned silently and the first you'd know was
      // a complaint. Logged at error level so it stands out in the stream.
      console.error(`[chat] rejected 503 reason=no_server_key — THE FREE TIER IS DOWN: ${requiredKey} is not set. Every free user is being refused.`)
      slog(deviceId, requestId, 'error', 'chat.rejected', 'free tier unavailable — server key missing', {
        status: 503, reason: 'no_server_key', keyOwner, modelPicker,
      })
      return NextResponse.json({
        error: "The free tier isn't available right now. Add your own Anthropic API key in Settings to continue.",
      }, { status: 503 })
    }
  }

  // Quota: free mode only. TWO limits — this device's daily allowance, and the
  // shared pool underneath it (see lib/server/quota.ts for why both). BYOK
  // bypasses both; it costs us no tokens. Slots are reserved up front (before the
  // LLM call) so concurrent requests can't over-serve; a request that then fails
  // without delivering output refunds them via refundQuota(deviceId).
  //
  // The two refusals get DIFFERENT words on purpose. "You've used your share" and
  // "the pool everyone shares is empty" feel completely different to a user, and
  // have different fixes — one is wait-or-BYOK, the other is nothing-you-did.
  let spentFreeQuota = false
  if (!byokKey) {
    const quota = checkAndIncrementQuota(deviceId)
    if (!quota.allowed) {
      const error = quota.blockedBy === 'device'
        ? `You've used your ${FREE_DEVICE_DAILY_LIMIT} free tones for today. Add your own Anthropic API key in Settings for unlimited use, or come back tomorrow.`
        : "Today's free tones have all been used — the pool is shared across everyone. Add your own Anthropic API key in Settings to keep going, or come back tomorrow."

      // THE REFUSALS ARE THE DEMAND SIGNAL, and they used to vanish silently.
      // The served requests tell you what the free tier COST. Only these tell you
      // what it was WORTH — how many people wanted a tone and were turned away.
      // Without them you cannot answer "is 100/10 too tight?", which is the whole
      // reason the limits exist. blockedBy separates the two very different
      // stories: 'device' = one person used their share (working as designed);
      // 'global' = the pool ran dry and EVERYONE is now locked out (the day is
      // over, and if this fires early and often the cap is too low).
      console.log(`[chat] rejected 429 reason=quota blockedBy=${quota.blockedBy} deviceRemaining=${quota.deviceRemaining} globalRemaining=${quota.globalRemaining}`)
      slog(deviceId, requestId, 'warn', 'chat.rejected', `quota exhausted (${quota.blockedBy})`, {
        status: 429, reason: 'quota', blockedBy: quota.blockedBy,
        deviceRemaining: quota.deviceRemaining,
        globalRemaining: quota.globalRemaining,
        deviceLimit: FREE_DEVICE_DAILY_LIMIT,
        globalLimit: FREE_DAILY_LIMIT,
      })
      return NextResponse.json({
        error,
        blockedBy: quota.blockedBy,
        deviceRemaining: quota.deviceRemaining,
        globalRemaining: quota.globalRemaining,
      }, { status: 429 })
    }
    spentFreeQuota = true
  }

  const provider = providerId

  // The scaffold's local-provider error handling ("Is the Ollama server
  // running?", "ollama pull <model>") lived here. There are no local providers —
  // Anthropic is the only entry in the registry — so those branches could never
  // fire. What's left is the provider's own message.
  // MAPPED and SCRUBBED, never raw.
  //
  // Mapped, because the raw provider text is what 29 real users saw on day one:
  // 18 got "Your credit balance is too low" and 11 got "invalid x-api-key", and
  // neither tells a guitarist the thing they need to know (a Claude Pro
  // subscription is not API credit). mapProviderError() branches on keyOwner —
  // the same error means "top up your account" to a BYOK user and "the free tier
  // is down" to everyone else.
  //
  // Scrubbed, because this string reaches both the browser and the `msg` column of
  // the log table, and a provider is free to quote request material back at us.
  const friendlyError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err)
    return mapProviderError(raw, keyOwner) || 'Internal server error'
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
  // device is guaranteed valid here — deviceInstrumentIssue returns 'no-device'
  // for anything falsy/unsupported and we returned 400 above.
  const toneCtx = resolveToneContext(device!, playedInstrument, clientRig, clientPickupNoise)
  const systemPrompt = applyLocaleHint(katanaSystemPrompt(toneCtx), activeLocale)
  const temperature  = TEMPERATURE
  const runOpts = { webSearch: wantWebSearch, temperature, apiKey: byokKey, tone: toneCtx }

  console.log(`[chat] msgs=${messages.length} provider=${provider} model=${model} (${modelPicker}) key=${keyOwner} stream=${!!wantStream} websearch=${wantWebSearch} temp=${temperature} locale=${activeLocale}`)

  slog(deviceId, requestId, 'info', 'chat.request', promptSummary(messages), {
    provider, model, stream: !!wantStream, webSearch: wantWebSearch,
    device: toneCtx.device, rig: toneCtx.rig, byok: !!byokKey,
    keyOwner, modelPicker,
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
      // What the model actually DIALLED, not just what it called the tone. The log
      // recorded only the name, which cannot tell you whether the patch behind it
      // was any good — see describePatch().
      let patch: string | undefined
      let amp: string | undefined
      let chars = 0
      // Token usage for this request, filled by runChatStream's onUsage once the
      // run completes (see runOpts below). Logged on the chat.response line so
      // every served request carries its own cost, not just its latency.
      let usage: RequestUsage = {}
      try {
        for await (const event of runChatStream(
          messages, provider, model, systemPrompt,
          { ...runOpts, onUsage: u => { usage = u } },
        )) {
          const e = event as {
            type?: string; content?: string; name?: string
            patch?: TonePatch
          }
          if (e?.type === 'delta' && typeof e.content === 'string') chars += e.content.length
          if (e?.type === 'tone_patch') {
            tone = e.patch?.name ?? e.name ?? tone
            // Record the settings themselves. Model output, not user input — no
            // privacy weight, so never withheld (unlike the prompt).
            if (e.patch) {
              patch = describePatch(e.patch)
              amp = e.patch.ampA?.type
            }
          }
          push(`data: ${JSON.stringify(event)}\n\n`)
        }
        push(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        // The cost is only OURS when the request ran on the server's key. Saying
        // so on the line matters: a BYOK Opus tone costs ~$0.30, and an
        // unqualified `est=$0.30` in the log reads as a hole in our budget when
        // it is in fact the user's own bill.
        console.log(
          `[chat] stream ${streamId} done` +
          ` model=${model} (${modelPicker}) key=${keyOwner}` +
          ` in=${usage.inputTokens ?? '?'} (billed ${usage.noCacheTokens ?? '?'})` +
          ` out=${usage.outputTokens ?? '?'} prose=${chars}ch` +
          ` cacheR=${usage.cacheReadTokens ?? 0} cacheW=${usage.cacheWriteTokens ?? 0}` +
          ` searches=${usage.webSearches ?? 0}` +
          ` est=$${usage.estUsd ?? '?'} ${keyOwner === 'user' ? '(their key)' : '(OURS)'}` +
          (patch ? `\n[chat]   patch: ${tone ?? '?'} — ${patch}` : ''),
        )
        slog(deviceId, requestId, 'info', 'chat.response', tone ? `tone: ${tone}` : undefined, {
          ms: Date.now() - startedAt, chars, tone, stream: true,
          model, webSearch: wantWebSearch, byok: !!byokKey,
          keyOwner, modelPicker,
          // The generated settings. `amp` is broken out as its own field because
          // it's the one worth AGGREGATING on — "Haiku picked Clean Twin for 80% of
          // requests" is the kind of quality regression that is invisible in a
          // free-text blob.
          amp, patch,
          // estUsd is in `usage`. It is a real cost either way — but WHOSE cost is
          // keyOwner, and any spend rollup must filter on it or it will bill us
          // for tones our users paid for themselves.
          ...usage,
        })
      } catch (err) {
        console.error(`[chat] stream ${streamId} error:`, err)
        // Refund the free slot only if the run failed before delivering any
        // output — a partial stream already spent tokens, so it stays counted.
        if (spentFreeQuota && chars === 0) refundQuota(deviceId)
        slog(deviceId, requestId, 'error', 'chat.error', friendlyError(err), {
          ms: Date.now() - startedAt, stream: true,
          // A failing BYOK request usually means THEIR key is bad (no credit,
          // revoked, rate-limited) — a completely different diagnosis from our
          // key failing, and indistinguishable without this.
          model, keyOwner, modelPicker,
          // The PROVIDER'S OWN WORDS, kept alongside the friendly text. `msg` now
          // holds what the user was shown, which is a translation — and a
          // translation is exactly what you must not diagnose from. Reading these
          // raw strings is how the BYOK failures were found in the first place; a
          // log that only stores our own copy would have hidden them.
          providerError: scrubString(err instanceof Error ? err.message : String(err)),
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
      model, keyOwner, modelPicker,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[chat] error:', err)
    // Non-stream runChat either returns a full result or throws — a throw means
    // nothing was delivered, so refund the reserved free slot.
    if (spentFreeQuota) refundQuota(deviceId)
    slog(deviceId, requestId, 'error', 'chat.error', friendlyError(err), {
      ms: Date.now() - startedAt, stream: false,
      model, keyOwner, modelPicker,
      providerError: scrubString(err instanceof Error ? err.message : String(err)),
    })
    return NextResponse.json({ error: friendlyError(err) }, { status: 500 })
  }
}
