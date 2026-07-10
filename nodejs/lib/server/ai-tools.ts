// Multi-provider chat engine on the Vercel AI SDK v6.
//
// Web search backend is controlled by CHATFRAME_SEARCH_BACKEND:
//   - native: use the provider's first-party search where available
//     (Anthropic web_search, Google grounding, Perplexity built-in).
//     Providers without native search get no search.
//   - tavily: always Tavily (requires TAVILY_API_KEY). Uniform across
//     providers but adds a third-party hop and per-search cost.
//   - auto (default): prefer native when the active provider has it,
//     fall back to Tavily otherwise.

import { streamText, generateText, tool, jsonSchema, stepCountIs } from 'ai'
import type { ModelMessage, LanguageModel } from 'ai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'

import { tavilySearch, type SearchResult } from './web-search'
import { getToolsForServers, executeMcpToolCall, isMcpToolName } from './mcp'

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
//   3. Restart chatframe
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
// Anthropic-only (2026-07-09). This map had nine providers when the app was
// forked from chatframe; the other eight are gone along with their @ai-sdk/*
// packages. @ai-sdk/anthropic reads ANTHROPIC_API_KEY, which is what the YAML
// declares under `envKey`.
const FACTORIES: Record<string, InternalModelFactory> = {
  // apiKey present → BYOK: build a request-scoped provider around the
  // caller's key. Absent → free tier: the default singleton reads
  // ANTHROPIC_API_KEY from the env. The BYOK key is never stored.
  anthropic: (m, _p, apiKey) => (apiKey ? createAnthropic({ apiKey })(m) : anthropic(m)),
}

export const PROVIDERS: ProviderInfo[] = loadProvidersConfig(FACTORIES)

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
// Populated by the Tavily web_search tool's execute() callback, and by
// provider-native search results that arrive as `source` chunks in the
// stream. MCP tool outputs are free-form and don't contribute here.
interface SourcesCollector { sources: { title: string; url: string }[] }

function buildTavilySearchTool(collector: SourcesCollector) {
  return tool({
    description:
      'Search the web for current information. Use for facts that may have changed since training, ' +
      'news, current events, or anything requiring up-to-date knowledge. Returns ranked results with snippets.',
    inputSchema: jsonSchema<{ query: string; max_results?: number }>({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query — be specific and concise.' },
        max_results: {
          type: 'number',
          description: 'Number of results to return (1-10). Default 5.',
          minimum: 1, maximum: 10,
        },
      },
      required: ['query'],
    }),
    execute: async ({ query, max_results }) => {
      const out = await tavilySearch(query, max_results ?? 5)
      // Capture for UI citation rendering.
      for (const r of out.results) collector.sources.push({ title: r.title, url: r.url })
      return out
    },
  })
}

// Wrap each MCP server's tools as AI SDK tools. Names are kept namespaced
// (<serverId>__<toolName>) to avoid collisions across servers.
async function buildMcpTools(serverIds: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  if (!serverIds.length) return out
  const mcpTools = await getToolsForServers(serverIds)
  for (const t of mcpTools) {
    out[t.function.name] = tool({
      description: t.function.description,
      // MCP tools come with arbitrary JSON Schemas — we accept whatever
      // shape the server declares and pass the validated args through.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: jsonSchema<Record<string, unknown>>(t.function.parameters as any),
      execute: async (args) => {
        if (!isMcpToolName(t.function.name)) {
          return { error: `Tool '${t.function.name}' is not a known MCP tool` }
        }
        const raw = await executeMcpToolCall(t.function.name, args)
        try { return JSON.parse(raw) } catch { return { text: raw } }
      },
    })
  }
  return out
}

// ─── Search backend resolution ──────────────────────────────────────────────

export type SearchBackend = 'native' | 'tavily' | 'auto'

function readBackendFlag(): SearchBackend {
  const raw = (process.env.CHATFRAME_SEARCH_BACKEND ?? 'auto').toLowerCase()
  if (raw === 'native' || raw === 'tavily') return raw
  return 'auto'
}

// Provider-native search: returns the tool entries to register on the
// request, or null if the provider has no native search. Anthropic-only
// since 2026-07-09 — the gemini (grounding) and perplexity (always-on
// Sonar search) branches went with their packages.
interface NativeSearch {
  tools: Record<string, unknown>
}

function getNativeSearch(providerId: string): NativeSearch | null {
  switch (providerId) {
    case 'anthropic':
      // Anthropic's server-side web search. We pick the 2025-03-05 version
      // (rather than 2026-02-09) because the newer one defaults to
      // "programmatic" tool calling, which Haiku 4.5 doesn't support and
      // any model without the programmatic capability rejects with HTTP 400.
      // 2025-03-05 is the long-standing variant that works across all
      // current Claude models (Opus/Sonnet/Haiku). maxUses caps how many
      // separate search calls the model can issue per assistant turn;
      // 5 mirrors our MAX_TOOL_ROUNDS for parity.
      return { tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }) } }
    default:
      return null
  }
}

interface ResolvedSearch {
  source: 'native' | 'tavily' | 'none'
  tools: Record<string, unknown>
  // True when the active backend surfaces citations as AI SDK `source`
  // stream chunks (all native paths). Tavily routes them through the
  // tool's execute() callback instead and sets this false.
  consumeSourceChunks: boolean
}

function resolveSearch(
  webSearchEnabled: boolean,
  providerId: string,
  sources: SourcesCollector,
): ResolvedSearch {
  if (!webSearchEnabled) {
    return { source: 'none', tools: {}, consumeSourceChunks: false }
  }
  const backend = readBackendFlag()
  const native = getNativeSearch(providerId)
  const tavilyAvailable = !!process.env.TAVILY_API_KEY

  const tavilyChoice = (): ResolvedSearch => ({
    source: 'tavily',
    tools: { web_search: buildTavilySearchTool(sources) },
    consumeSourceChunks: false,
  })
  const noneChoice = (): ResolvedSearch => ({
    source: 'none', tools: {}, consumeSourceChunks: false,
  })

  if (backend === 'native') {
    return native
      ? { source: 'native', tools: native.tools, consumeSourceChunks: true }
      : noneChoice()
  }
  if (backend === 'tavily') {
    return tavilyAvailable ? tavilyChoice() : noneChoice()
  }
  // auto: prefer native (no extra API key, lower latency, no third-party hop).
  if (native) return { source: 'native', tools: native.tools, consumeSourceChunks: true }
  if (tavilyAvailable) return tavilyChoice()
  return noneChoice()
}

// Build the per-request tool map for AI SDK. Resolved search backend's
// tools plus any MCP server tools the user selected.
async function buildTools(
  resolvedSearch: ResolvedSearch,
  mcpServerIds: string[] | undefined,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = { ...resolvedSearch.tools }
  if (mcpServerIds && mcpServerIds.length > 0) {
    Object.assign(tools, await buildMcpTools(mcpServerIds))
  }
  return tools
}

const MAX_TOOL_ROUNDS = 5

// ─── Public API (signatures preserved from the token.js version) ────────────

export interface RunChatOptions {
  webSearch?: boolean
  temperature?: number
  mcpServers?: string[]
  /**
   * BYOK: a caller-supplied Anthropic key for this request only. When set,
   * the free-tier quota is not consumed and the server's own key is unused.
   * Transient — do not persist or log it.
   */
  apiKey?: string
}

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'tool_running'; name: string; query?: string }
  | { type: 'sources'; sources: { title: string; url: string }[] }

export async function runChat(
  messages: ChatMessage[],
  providerId: string = 'anthropic',
  model: string = 'claude-opus-4-8',
  systemPrompt: string = 'You are a helpful AI assistant.',
  options: RunChatOptions = {},
): Promise<ChatResult> {
  const p = findProvider(providerId)
  if (!p) throw new Error(`Unknown provider '${providerId}'`)

  const sourcesCollector: SourcesCollector = { sources: [] }
  const resolvedSearch = resolveSearch(!!options.webSearch, providerId, sourcesCollector)
  const tools = await buildTools(resolvedSearch, options.mcpServers)

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
  model: string = 'claude-opus-4-8',
  systemPrompt: string = 'You are a helpful AI assistant.',
  options: RunChatOptions = {},
): AsyncGenerator<StreamEvent, void, unknown> {
  const p = findProvider(providerId)
  if (!p) throw new Error(`Unknown provider '${providerId}'`)

  // Sources collector. Tavily pushes here via its execute() callback; native
  // search paths push from the `source` stream-chunk handler below. Either
  // way, freshly-collected sources are yielded to the UI in batches.
  const sourcesCollector: SourcesCollector = { sources: [] }
  const resolvedSearch = resolveSearch(!!options.webSearch, providerId, sourcesCollector)
  const tools = await buildTools(resolvedSearch, options.mcpServers)

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
        // Provider-native search citations arrive as 'source' chunks in the
        // stream (Anthropic web_search, Google grounding, Perplexity Sonar).
        // Tavily uses the execute() collector path instead — guarded by the
        // resolvedSearch flag to avoid double-counting if a provider ever
        // surfaces sources alongside our tool's own results.
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
