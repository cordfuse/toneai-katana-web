// Chat engine on the Vercel AI SDK v6. Anthropic-only. Web search uses
// Anthropic's native server-side web_search tool (no third-party backend).

import { streamText, generateText, tool, jsonSchema, stepCountIs } from 'ai'
import type { ModelMessage, LanguageModel } from 'ai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'

import { DEFAULT_MODEL } from './models'
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
    // Cloud: available iff its API-key env is set. Local: always reported
    // available — chat call surfaces a clear ECONNREFUSED if the server
    // isn't running, which is more useful than gating the picker here.
    available: p.category === 'local' ? true : !!(p.envKey && process.env[p.envKey]),
    defaultModel: p.defaultModel,
    models: p.models,
  }))
}

export function isModelValidForProvider(provider: string, model: string): boolean {
  const p = PROVIDERS.find(x => x.id === provider)
  if (!p) return false
  if (p.category === 'local') return typeof model === 'string' && model.length > 0
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

// Max web searches the model may run per assistant turn. This is the primary
// cost governor for search (searches bill to the server key on the free tier);
// combined with FREE_DAILY_LIMIT it bounds the daily search ceiling to
// requests/day * maxUses. Operator-tunable; clamped 1..10 so a bad value can't
// disable search (0) or blow the budget. Default 3 — enough to identify the
// artist/song rig, pull settings, and cross-check, without wandering.
const WEB_SEARCH_MAX_USES: number = (() => {
  const raw = parseInt(process.env.TONEAI_WEB_SEARCH_MAX_USES ?? '', 10)
  return Number.isFinite(raw) ? Math.min(10, Math.max(1, raw)) : 3
})()

function resolveSearch(webSearchEnabled: boolean, providerId: string): ResolvedSearch {
  if (!webSearchEnabled || !hasNativeWebSearch(providerId)) {
    return { tools: {}, consumeSourceChunks: false }
  }
  // Anthropic's server-side web search. We pick the 2025-03-05 version (rather
  // than 2026-02-09) because the newer one defaults to "programmatic" tool
  // calling, which Haiku 4.5 doesn't support and any model without the
  // programmatic capability rejects with HTTP 400. 2025-03-05 works across all
  // current Claude models (Opus/Sonnet/Haiku). maxUses caps searches per turn.
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
  if (options.tone) tools[TONE_TOOL_NAME] = buildToneTool()

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

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        // AI SDK v6 uses `text` on text-delta chunks.
        if (chunk.text) yield { type: 'delta', content: chunk.text }
        break

      case 'tool-call': {
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
}
