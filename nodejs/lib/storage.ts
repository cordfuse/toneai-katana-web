import type { Conversation, ChatMessage } from './types'

// ─── Conversations ────────────────────────────────────────────────────────────

const CONV_KEY = 'chatframe_conversations'
const MAX_CONVERSATIONS = 50

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(CONV_KEY) ?? '[]') } catch { return [] }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem(CONV_KEY, JSON.stringify(convs.slice(0, MAX_CONVERSATIONS)))
}

export function upsertConversation(conv: Conversation) {
  const all = loadConversations()
  const idx = all.findIndex(c => c.id === conv.id)
  if (idx >= 0) all[idx] = conv
  else all.unshift(conv)
  all.sort((a, b) => b.updatedAt - a.updatedAt)
  saveConversations(all)
}

export function deleteConversation(id: string) {
  saveConversations(loadConversations().filter(c => c.id !== id))
}

export function renameConversation(id: string, title: string) {
  const all = loadConversations()
  const idx = all.findIndex(c => c.id === id)
  if (idx < 0) return
  all[idx] = { ...all[idx], title, updatedAt: Date.now() }
  all.sort((a, b) => b.updatedAt - a.updatedAt)
  saveConversations(all)
}

export function clearAllConversations() {
  localStorage.removeItem(CONV_KEY)
}

// Serialize one conversation to a markdown transcript suitable for download.
// Includes title, export timestamp, every turn with role label, and any
// source citations the assistant produced. Attachment binaries are not
// embedded — file names only — since markdown can't carry binary data.
export function conversationToMarkdown(c: Conversation): string {
  const lines: string[] = []
  lines.push(`# ${c.title}`, '')
  lines.push(`_Exported ${new Date().toISOString()}_`, '', '---', '')
  for (const m of c.messages) {
    lines.push(m.role === 'user' ? '## You' : '## Assistant', '')
    lines.push(m.content || '_(empty)_', '')
    if (m.attachments?.length) {
      lines.push('_Attachments:_')
      for (const a of m.attachments) lines.push(`- ${a.name} (${a.mimeType})`)
      lines.push('')
    }
    if (m.sources?.length) {
      lines.push('_Sources:_')
      for (const s of m.sources) lines.push(`- [${s.title || s.url}](${s.url})`)
      lines.push('')
    }
    lines.push('---', '')
  }
  return lines.join('\n')
}

// Trigger a browser download of `text` as the file at `filename`. Sticks
// the blob into a temporary <a download> and clicks it. Standard pattern —
// no library needed.
export function downloadTextFile(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function autoTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user')?.content ?? 'New chat'
  return first.length > 42 ? first.slice(0, 42).trimEnd() + '…' : first
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(ts).toLocaleDateString()
}

// ─── Theme ────────────────────────────────────────────────────────────────────
//
// Built-in palette = 25 popular dev themes (13 dark + 12 light). Forkers can
// add their own via chatframe.config.json (themes[]); those IDs flow through to
// the client via window.__CHATFRAME (set by app/layout.tsx).
//
// To add a built-in theme: append the id to BUILT_IN_THEME_IDS in
// lib/config.ts, add a `[data-theme="<id>"]` block in app/globals.css, and
// add the swatch metadata to THEMES in app/_Home.tsx.

// Theme is just a string — IDs come from runtime config and aren't known
// at compile time. Validation happens at runtime via the allowed set
// the server injects into window.__CHATFRAME.
export type Theme = string

const THEME_KEY = 'chatframe_theme'

// Read SSR-injected globals. SSR safe: returns sensible fallbacks when
// window isn't defined yet (server render, tests).
function getInjectedAllowedThemes(): string[] | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __CHATFRAME?: { allowedThemeIds?: string[] } }
  return w.__CHATFRAME?.allowedThemeIds ?? null
}
function getInjectedDefaultTheme(): string {
  if (typeof window === 'undefined') return 'dracula'
  const w = window as unknown as { __CHATFRAME?: { defaultTheme?: string } }
  return w.__CHATFRAME?.defaultTheme ?? 'dracula'
}

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dracula'
  const stored = localStorage.getItem(THEME_KEY)
  const allowed = getInjectedAllowedThemes()
  const fallback = getInjectedDefaultTheme()
  // Guard against stale IDs (e.g. a forker removed a custom theme but a
  // user still has the old id in localStorage) — fall back to default.
  if (!stored) return fallback
  if (!allowed) return stored  // server didn't inject — trust the value
  return allowed.includes(stored) ? stored : fallback
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
}

// ─── Provider + model preferences ────────────────────────────────────────────
//
// Provider selection is a single string; model selection is per-provider
// (so switching back to Anthropic remembers you were on Sonnet, not Opus).
// Both fall back gracefully — server-side validates the selection and falls
// back to its registry default if anything's stale or unknown.

const PROVIDER_KEY = 'chatframe_provider'
const MODELS_KEY = 'chatframe_models'  // JSON map: { providerId: modelId }

export function getSelectedProvider(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(PROVIDER_KEY)
}

export function setSelectedProvider(provider: string) {
  localStorage.setItem(PROVIDER_KEY, provider)
}

function loadModelMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(MODELS_KEY) ?? '{}') } catch { return {} }
}

export function getSelectedModel(provider: string): string | null {
  return loadModelMap()[provider] ?? null
}

export function setSelectedModel(provider: string, model: string) {
  const map = loadModelMap()
  map[provider] = model
  localStorage.setItem(MODELS_KEY, JSON.stringify(map))
}

// ─── Web search toggle (global, sticky across sessions) ─────────────────────
//
// One boolean stored in localStorage. v1 simplification: a single setting
// applies to whatever conversation is active. Avoids the "no conv id until
// after first send" chicken-and-egg. Per-conv override can come later.

const WEB_SEARCH_KEY = 'chatframe_web_search'

export function getWebSearchEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(WEB_SEARCH_KEY) === '1'
}

export function setWebSearchEnabled(enabled: boolean) {
  if (enabled) localStorage.setItem(WEB_SEARCH_KEY, '1')
  else localStorage.removeItem(WEB_SEARCH_KEY)
}

// ─── TTS (text-to-speech) toggle ────────────────────────────────────────────
// Same persistence pattern as web search. When on, assistant responses are
// spoken via the Web Speech API once the stream completes. Default off
// (auto-speaking on every visit is invasive on shared devices).

const TTS_KEY = 'chatframe_tts_enabled'

export function getTtsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(TTS_KEY) === '1'
}

export function setTtsEnabled(enabled: boolean) {
  if (enabled) localStorage.setItem(TTS_KEY, '1')
  else localStorage.removeItem(TTS_KEY)
}

// ─── MCP server selection (per-user, persisted) ─────────────────────────────
//
// Set of server IDs the user has toggled on in the composer's MCP picker.
// Same model as web search: sticky across sessions, applies to the active
// conversation. Stored as a JSON array of strings.

const MCP_ENABLED_KEY = 'chatframe_mcp_enabled'

export function getEnabledMcps(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(MCP_ENABLED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch { return [] }
}

export function setEnabledMcps(ids: string[]) {
  if (ids.length === 0) localStorage.removeItem(MCP_ENABLED_KEY)
  else localStorage.setItem(MCP_ENABLED_KEY, JSON.stringify(ids))
}

// ─── Generation settings (user overrides — operator defaults via env) ────────
//
// All three are `null` when the user hasn't set them; in that case the server
// falls back to CHATFRAME_SYSTEM_PROMPT / CHATFRAME_TEMPERATURE / CHATFRAME_MAX_TOKENS env
// vars, then to hardcoded defaults. Read/written as strings since localStorage
// is string-only — callers handle conversion.

const SYSTEM_PROMPT_KEY = 'chatframe_system_prompt'
const TEMPERATURE_KEY   = 'chatframe_temperature'

export function getCustomSystemPrompt(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SYSTEM_PROMPT_KEY)
}
export function setCustomSystemPrompt(s: string | null) {
  if (s && s.trim().length > 0) localStorage.setItem(SYSTEM_PROMPT_KEY, s)
  else localStorage.removeItem(SYSTEM_PROMPT_KEY)
}

export function getTemperature(): number | null {
  if (typeof window === 'undefined') return null
  const v = localStorage.getItem(TEMPERATURE_KEY)
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
export function setTemperature(t: number | null) {
  if (t === null) localStorage.removeItem(TEMPERATURE_KEY)
  else localStorage.setItem(TEMPERATURE_KEY, String(t))
}

// ─── Export / Import / Reset ─────────────────────────────────────────────────

export interface ChatframeExport {
  chatframe_export_version: 1
  exported_at: string
  conversations: Conversation[]
}

export function exportAll(): ChatframeExport {
  return {
    chatframe_export_version: 1,
    exported_at: new Date().toISOString(),
    conversations: loadConversations(),
  }
}

export interface ImportResult { imported: number; skipped: number; total: number }

export function importConversationsJson(json: string): ImportResult {
  const parsed = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid file')
  if (parsed.chatframe_export_version !== 1) throw new Error('Unsupported export version')
  if (!Array.isArray(parsed.conversations)) throw new Error('No conversations in file')

  const existing = loadConversations()
  const existingIds = new Set(existing.map(c => c.id))
  let imported = 0
  let skipped = 0
  for (const conv of parsed.conversations as Conversation[]) {
    if (!conv?.id || typeof conv.id !== 'string') { skipped++; continue }
    if (existingIds.has(conv.id)) { skipped++; continue }
    existing.push(conv)
    existingIds.add(conv.id)
    imported++
  }
  existing.sort((a, b) => b.updatedAt - a.updatedAt)
  saveConversations(existing)
  return { imported, skipped, total: parsed.conversations.length }
}

// Wipes every chatframe_* localStorage key (conversations, theme, provider, model,
// web search, generation settings, send key). Also drops the auth token +
// device id so the next session starts completely fresh.
export function resetAllData() {
  if (typeof window === 'undefined') return
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k) continue
    if (k.startsWith('chatframe_') || k === 'auth_token' || k === 'device_id') toRemove.push(k)
  }
  for (const k of toRemove) localStorage.removeItem(k)
}
