// Chat engine on the Vercel AI SDK v6. Anthropic-only. Web search uses
// Anthropic's native server-side web_search tool (no third-party backend).

import { streamText, generateText, tool, jsonSchema, stepCountIs } from 'ai'
import type { ModelMessage, LanguageModel } from 'ai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'

import { DEFAULT_MODEL } from './models'
import { summarizeUsage, type RequestUsage } from './usage'
import {
  buildToneTool, buildTonePatchEvent, TONE_TOOL_NAME,
  type ToneContext, type TonePatchEvent,
} from './tone'

// ─── Model registry ──────────────────────────────────────────────────────────
//
// Provider DATA (id, label, category, envKey, defaultModel, models[]) lives
// in `config/providers.yaml` — operator-editable, no TypeScript required.
// Provider BEHAVIOR (factory functions that construct AI SDK LanguageModel
// instances) lives here in code — they capture per-provider runtime
// wiring like env-var precedence and baseURL detection. The YAML loader
// (lib/server/providers-config.ts) merges the two at startup.
//
// Add a new provider:
//   1. Append an entry to `config/providers.yaml`
//   2. Add a matching factory below in `FACTORIES`
//   3. Restart the app
//
// Add a new model to an existing provider: edit YAML only.
// Relabel / reorder models: edit YAML only.
//
// AI21 was dropped from token.js's coverage in the migration — they don't
// expose an OpenAI-compatible endpoint and don't have a first-party AI SDK
// provider package. Re-add via @ai-sdk/openai-compatible if AI21 ever
// publishes an OpenAI-shaped surface.

export type { ModelInfo, ProviderCategory, ProviderInfo, ModelFactory, PublicProviderInfo } from './ai-tools-types'
import type { InternalModelFactory, ProviderInfo, PublicProviderInfo } from './ai-tools-types'
import { loadProvidersConfig } from './providers-config'

// Factory map keyed by provider id. Matches the provider keys in
// config/providers.yaml. Each factory receives the YAML-resolved
// ProviderInfo as its second arg — so any per-provider config (envKey)
// reads from YAML at call time instead of being duplicated in a closure.
// The loader binds the second arg via partial application before exposing
// the public createModel surface.
//
// Anthropic-only (2026-07-09). This map had nine providers in the upstream
// chat-framework scaffold; the other eight are gone along with their @ai-sdk/*
// packages. @ai-sdk/anthropic reads ANTHROPIC_API_KEY, which is what the YAML
// declares under `envKey`.
const FACTORIES: Record<string, InternalModelFactory> = {
  // apiKey present → BYOK: build a request-scoped provider around the
  // caller's key. Absent → free tier: the default singleton reads
  // ANTHROPIC_API_KEY from the env. The BYOK key is never stored.
  anthropic: (m, _p, apiKey) => (apiKey ? createAnthropic({ apiKey })(m) : anthropic(m)),
}

export const PROVIDERS: ProviderInfo[] = loadProvidersConfig(FACTORIES)

// Make TONEAI_MODEL the authoritative default for the default provider, so
// the client (which reads defaultModel via /api/providers) and the server agree
// on one env-driven model. Ignored if the env model isn't in that provider's
// list — YAML stays the fallback.
const DEFAULT_PROVIDER_ID = 'anthropic'
{
  const dp = PROVIDERS.find(p => p.id === DEFAULT_PROVIDER_ID)
  if (dp && dp.models.some(m => m.id === DEFAULT_MODEL)) {
    dp.defaultModel = DEFAULT_MODEL
  }
}

export function findProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find(p => p.id === id)
}

export function getAvailableProviders(): PublicProviderInfo[] {
  return PROVIDERS.map(p => ({
    id: p.id,
    label: p.label,
    category: p.category,
    // Available iff its API-key env is set.
    available: !!(p.envKey && process.env[p.envKey]),
    defaultModel: p.defaultModel,
    models: p.models,
  }))
}

/** Is `model` in this provider's allow-list? Guards TONEAI_MODEL against an
 *  operator typo — a model the provider doesn't serve would 404 at call time. */
export function isModelValidForProvider(provider: string, model: string): boolean {
  const p = PROVIDERS.find(x => x.id === provider)
  if (!p) return false
  return p.models.some(m => m.id === model)
}

// ─── Message shape passed in from the chat API route ────────────────────────

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface ChatResult {
  message: string
  sources?: { title: string; url: string }[]
}

// Translate our incoming wire shape to AI SDK's ModelMessage[]. The first
// message is the system prompt — packaged as a SystemModelMessage so we can
// attach provider-specific options (Anthropic cacheControl) to it cleanly,
// rather than passing it as the bare `system:` parameter on streamText.
function toModelMessages(
  systemPrompt: string,
  messages: ChatMessage[],
  providerId: string,
): ModelMessage[] {
  const out: ModelMessage[] = []

  // System message — Anthropic prompt-caching marker goes here. The system
  // prompt is by definition stable across a multi-turn chat, so it's the
  // highest-leverage marker for cache hits. ephemeral = 5-min TTL, no extra
  // cost beyond a one-time cache-write fee on first turn; subsequent turns
  // pay ~10% of normal input tokens for the cached portion.
  out.push(
    providerId === 'anthropic'
      ? {
          role: 'system',
          content: systemPrompt,
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
        }
      : { role: 'system', content: systemPrompt },
  )

  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content })
    } else {
      // Multimodal content — translate image_url blocks to AI SDK's image
      // part shape and text blocks to text parts. AI SDK narrows the role
      // type per message variant; the cast tells TS the runtime guarantee
      // (m.role is always 'user' for multimodal in practice — assistant
      // messages from our store are always plain strings).
      const parts = m.content.map(block => {
        if (block.type === 'text') return { type: 'text' as const, text: block.text }
        return { type: 'image' as const, image: new URL(block.image_url.url) }
      })
      if (m.role === 'user') out.push({ role: 'user', content: parts })
      else out.push({ role: 'assistant', content: parts.filter(p => p.type === 'text') })
    }
  }

  return out
}

// ─── Tool definitions ───────────────────────────────────────────────────────

// Sources captured during a run so the UI can render them as citations.
// Populated by Anthropic native search results that arrive as `source`
// chunks in the stream.
interface SourcesCollector { sources: { title: string; url: string }[] }

// ─── Web search (Anthropic native) ──────────────────────────────────────────
//
// Anthropic-only, so search is always its server-side web_search tool — no
// backend selection, no third-party hop. Citations arrive as AI SDK `source`
// stream chunks, drained into the SourcesCollector by the run loops below.

// Whether the active provider offers native web search. Only Anthropic does;
// used by the /providers route to decide if the composer shows the globe.
export function hasNativeWebSearch(providerId: string): boolean {
  return providerId === 'anthropic'
}

interface ResolvedSearch {
  tools: Record<string, unknown>
  // True when citations surface as AI SDK `source` stream chunks (native path).
  consumeSourceChunks: boolean
}

// Max web searches the model may run per assistant turn. Caps the per-request
// SEARCH FEE ($10/1,000 searches). Note this is NOT the main cost governor —
// measurement showed roughly one search per request, so the fee is a small share
// of the bill. The tokens the search RESULTS cost are the expensive part, and
// dynamic filtering (below) is what governs those. Clamped 1..10 so a bad value
// can't disable search (0) or blow the budget.
const WEB_SEARCH_MAX_USES: number = (() => {
  const raw = parseInt(process.env.TONEAI_WEB_SEARCH_MAX_USES ?? '', 10)
  return Number.isFinite(raw) ? Math.min(10, Math.max(1, raw)) : 3
})()

// DYNAMIC FILTERING (web_search_20260209) — TRIED AND MEASURED, REJECTED
// 2026-07-12. Do NOT "upgrade" to it without re-measuring: the docs make it sound
// like a free win for exactly our problem, and on this workload it is the
// opposite.
//
// The pitch: with basic search every result is loaded into context whole, most of
// it irrelevant; with 20260209 Claude writes and runs code that filters results
// BEFORE they reach the context — "this reduces token use on search-heavy
// requests." True — for search-HEAVY requests.
//
// Measured, same three artist-rig prompts, Sonnet 4.6, totalUsage per request:
//
//   basic   (20250305)   33k / 36k / 38k input, 1 search    $0.093 / $0.099 / $0.105
//   dynamic (20260209)   96k / 64k / 67k input, 2 searches  $0.195 / $0.127 / $0.136
//
// About 2x WORSE. Dynamic filtering runs the search from inside code execution:
// the model writes filter code, runs it, iterates. That machinery has its own
// token cost, and it provoked two searches where basic made one. A tone design
// does roughly ONE search — there isn't enough result payload for the filtering
// to recover what the wrapper costs. It would likely win on a genuinely
// search-heavy task (many searches over large pages). That isn't this app.
function resolveSearch(webSearchEnabled: boolean, providerId: string): ResolvedSearch {
  if (!webSearchEnabled || !hasNativeWebSearch(providerId)) {
    return { tools: {}, consumeSourceChunks: false }
  }
  return {
    tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: WEB_SEARCH_MAX_USES }) },
    consumeSourceChunks: true,
  }
}

// Per-request tool map for the AI SDK — just the resolved search tools.
function buildTools(resolvedSearch: ResolvedSearch) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = { ...resolvedSearch.tools }
  return tools
}

const MAX_TOOL_ROUNDS = 5

// ─── Public API (signatures preserved from the token.js version) ────────────

export interface RunChatOptions {
  webSearch?: boolean
  temperature?: number
  /**
   * BYOK: a caller-supplied Anthropic key for this request only. When set,
   * the free-tier quota is not consumed and the server's own key is unused.
   * Transient — do not persist or log it.
   */
  apiKey?: string
  /**
   * Tone-design context (target device + rig). When present, the
   * design_tone_patch tool is offered and its calls become tone_patch events.
   */
  tone?: ToneContext
  /**
   * Called once with the request's token usage after the run completes.
   * Best-effort and non-blocking: a failure here must never affect the user's
   * response, so the caller's errors are swallowed.
   */
  onUsage?: (usage: RequestUsage) => void
}

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'tool_running'; name: string; query?: string }
  | { type: 'sources'; sources: { title: string; url: string }[] }
  | TonePatchEvent

export async function runChat(
  messages: ChatMessage[],
  providerId: string = 'anthropic',
  model: string = DEFAULT_MODEL,
  systemPrompt: string = 'You are a helpful AI assistant.',
  options: RunChatOptions = {},
): Promise<ChatResult> {
  const p = findProvider(providerId)
  if (!p) throw new Error(`Unknown provider '${providerId}'`)

  const sourcesCollector: SourcesCollector = { sources: [] }
  const resolvedSearch = resolveSearch(!!options.webSearch, providerId)
  const tools = buildTools(resolvedSearch)

  const result = await generateText({
    model: p.createModel(model, options.apiKey),
    messages: toModelMessages(systemPrompt, messages, providerId),
    // The system prompt lives in the messages array (not as `system:`) so
    // we can attach Anthropic's cacheControl providerOption to it. Our
    // system prompt is operator-controlled config, not user input, so the
    // prompt-injection concern this flag warns about doesn't apply.
    allowSystemInMessages: true,
    tools: Object.keys(tools).length ? tools : undefined,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
  })

  // Native search paths surface citations through the response's sources
  // collection rather than the tool execute() callback — drain them here.
  if (resolvedSearch.consumeSourceChunks && result.sources?.length) {
    for (const s of result.sources) {
      if (s.sourceType === 'url') {
        sourcesCollector.sources.push({ title: s.title ?? s.url, url: s.url })
      }
    }
  }

  return {
    message: result.text,
    sources: sourcesCollector.sources.length ? sourcesCollector.sources : undefined,
  }
}

export async function* runChatStream(
  messages: ChatMessage[],
  providerId: string = 'anthropic',
  model: string = DEFAULT_MODEL,
  systemPrompt: string = 'You are a helpful AI assistant.',
  options: RunChatOptions = {},
): AsyncGenerator<StreamEvent, void, unknown> {
  const p = findProvider(providerId)
  if (!p) throw new Error(`Unknown provider '${providerId}'`)

  // Native search pushes citations from the `source` stream-chunk handler
  // below; freshly-collected sources are yielded to the UI in batches.
  const sourcesCollector: SourcesCollector = { sources: [] }
  const resolvedSearch = resolveSearch(!!options.webSearch, providerId)
  const tools = buildTools(resolvedSearch)
  // Offer the tone-design tool when the request carries tone context.
  if (options.tone) tools[TONE_TOOL_NAME] = buildToneTool(options.tone.device)

  const result = streamText({
    model: p.createModel(model, options.apiKey),
    messages: toModelMessages(systemPrompt, messages, providerId),
    // See runChat above — operator-controlled system prompt, so the
    // prompt-injection advisory doesn't apply.
    allowSystemInMessages: true,
    tools: Object.keys(tools).length ? tools : undefined,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
  })

  // Track how many sources we've already yielded so each tool round only
  // yields the newly-collected ones, not the full accumulating list.
  let yieldedSources = 0
  // Count the searches ourselves. Anthropic bills $10/1,000 and reports the count
  // as `server_tool_use.web_search_requests`, but the AI SDK does not surface
  // that on its usage object — so the tool-calls we see on the stream ARE the
  // measurement. One web_search tool-call = one billed search.
  let webSearches = 0

  // PRE-TOOL NARRATION FILTER.
  //
  // The system prompt tells the model to say nothing before it calls a tool.
  // Sonnet obeys; Haiku does not — it leaks its research notes ("Now I have
  // enough background. Mick Ronson's tone centers on a Tone Bender...") and the
  // real explanation then gets glued onto the end of that. Asking more firmly is
  // not a fix: small models are unreliable at negative instructions, and the
  // failure is user-visible.
  //
  // So don't ask — make it structurally impossible. Text emitted before the
  // model COMMITS TO A PATCH is buffered, never streamed, and dropped once the
  // patch arrives: by definition it was talking about a tone it had not chosen
  // yet, which is exactly the narration we don't want.
  //
  // THE GATE IS THE TONE TOOL, NOT "the first tool call". Measured, 2026-07-12:
  // Haiku leaks in the gap BETWEEN the web search and the tone call — it reports
  // what it found, then designs. Gating on the first tool call opens the gate on
  // the *search* and lets that second block straight through, which is the bug
  // this comment exists to stop someone re-introducing.
  //
  // The buffer must be FLUSHED if the tone tool is never called: a plain
  // conversational reply ("what does presence do?") produces text and no patch,
  // and swallowing it would turn a good answer into an empty one. That flush is
  // the safety property this whole filter hinges on.
  const gateTool = options.tone ? TONE_TOOL_NAME : null
  let gateOpen = false
  let preface = ''

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        // AI SDK v6 uses `text` on text-delta chunks.
        if (!chunk.text) break
        // No tone context (a plain chat) — there is no patch to gate on, so
        // stream normally.
        if (gateOpen || !gateTool) yield { type: 'delta', content: chunk.text }
        else preface += chunk.text
        break

      case 'tool-call': {
        // The patch is committed: everything buffered so far was pre-design
        // narration. Bin it, and let the real explanation through from here.
        if (chunk.toolName === gateTool) {
          gateOpen = true
          preface = ''
        }
        // The tone tool's call carries the whole patch as its input — build the
        // .tsl and surface it as a tone_patch event (the card). Skip the generic
        // tool_running hint for it; it's not a "searching…" affordance.
        if (chunk.toolName === TONE_TOOL_NAME && options.tone) {
          const event = buildTonePatchEvent(chunk.input as Record<string, unknown>, options.tone)
          if (event) yield event
          break
        }
        // Surface the tool-running hint to the UI. Parse query out for nicer
        // labelling on the web_search case.
        let query: string | undefined
        if (chunk.toolName === 'web_search') {
          webSearches++
          const input = chunk.input as { query?: string } | undefined
          query = input?.query
        }
        yield { type: 'tool_running', name: chunk.toolName, query }
        break
      }

      case 'tool-result':
        // After the tool finished, emit any newly-collected sources.
        if (sourcesCollector.sources.length > yieldedSources) {
          const fresh = sourcesCollector.sources.slice(yieldedSources)
          yieldedSources = sourcesCollector.sources.length
          yield { type: 'sources', sources: fresh }
        }
        break

      case 'source':
        // Anthropic native web_search citations arrive as 'source' chunks in
        // the stream. Guarded by the resolvedSearch flag so we only collect
        // them when search was actually enabled for this request.
        if (resolvedSearch.consumeSourceChunks && chunk.sourceType === 'url') {
          const src = { title: chunk.title ?? chunk.url, url: chunk.url }
          sourcesCollector.sources.push(src)
          yieldedSources = sourcesCollector.sources.length
          yield { type: 'sources', sources: [src] }
        }
        break

      case 'error':
        // AI SDK surfaces upstream errors as a typed chunk; rethrow so the
        // chat route's catch handler formats it for the client.
        throw chunk.error instanceof Error
          ? chunk.error
          : new Error(String((chunk.error as { message?: string })?.message ?? chunk.error))

      default:
        // finish, finish-step, start, reasoning, source — not surfaced today.
        break
    }
  }

  // The tone tool was never called, so the buffered text is not narration — it
  // IS the answer (a question, a clarification, a refusal). Release it.
  if (!gateOpen && preface) yield { type: 'delta', content: preface }

  // Token accounting, once the run is done. `totalUsage` — NOT `usage` — because
  // it sums every step: in a tool loop the accumulated search results are
  // re-sent as input on each step, and that amplification is the thing we're
  // trying to see. Strictly best-effort; a usage-reporting failure must never
  // turn a delivered answer into an error.
  if (options.onUsage) {
    try {
      options.onUsage(summarizeUsage(await result.totalUsage, model, webSearches))
    } catch {
      /* diagnostics are never load-bearing */
    }
  }
}
