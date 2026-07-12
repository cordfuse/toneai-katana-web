import type { Conversation, ChatMessage, SavedTone } from './types'

// ─── Conversations ────────────────────────────────────────────────────────────

const CONV_KEY = 'toneai_conversations'
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

// ─── Tone library ─────────────────────────────────────────────────────────────
//
// A dedicated store so the "My Tones" gallery is independent of conversations —
// deleting a chat (or aging past the 50-conversation cap) never loses a saved
// tone. Newest-first by updatedAt, same shape of helpers as conversations.

const TONES_KEY = 'toneai_tones'
const MAX_TONES = 300

export function loadTones(): SavedTone[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(TONES_KEY) ?? '[]') } catch { return [] }
}

function saveTones(tones: SavedTone[]) {
  localStorage.setItem(TONES_KEY, JSON.stringify(tones.slice(0, MAX_TONES)))
}

export function addTone(tone: SavedTone) {
  const all = loadTones()
  const idx = all.findIndex(t => t.id === tone.id)
  if (idx >= 0) all[idx] = tone
  else all.unshift(tone)
  all.sort((a, b) => b.updatedAt - a.updatedAt)
  saveTones(all)
}

export function deleteTone(id: string) {
  saveTones(loadTones().filter(t => t.id !== id))
}

export function renameTone(id: string, name: string) {
  const all = loadTones()
  const idx = all.findIndex(t => t.id === id)
  if (idx < 0) return
  all[idx] = { ...all[idx], name, updatedAt: Date.now() }
  all.sort((a, b) => b.updatedAt - a.updatedAt)
  saveTones(all)
}

export function clearAllTones() {
  localStorage.removeItem(TONES_KEY)
}

// One-time backfill guard. The tone library seeds itself from tones already
// present in existing chats — but only ONCE per browser. Without this flag the
// seed would run on every load and resurrect any library tone the user deleted
// while its source chat still exists. New tones are saved on generation, so the
// seed is purely a migration for tones created before the library shipped.
const TONES_BACKFILLED_KEY = 'toneai_tones_backfilled'

export function tonesBackfilled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(TONES_BACKFILLED_KEY) === '1'
}

export function markTonesBackfilled() {
  localStorage.setItem(TONES_BACKFILLED_KEY, '1')
}

// ─── Welcome banner (once per version) ───────────────────────────────────────
// Stores the version whose welcome the user has dismissed. The banner shows when
// the stored value differs from the running app version, so a new release
// re-triggers it exactly once. SSR returns `true` (seen) so the modal never
// flashes during hydration — it only appears client-side once we can read the
// real stored value.
const WELCOME_KEY = 'toneai_welcome_seen'

export function getWelcomeSeen(version: string): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(WELCOME_KEY) === version
}

export function saveWelcomeSeen(version: string) {
  localStorage.setItem(WELCOME_KEY, version)
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
// add their own via toneai.config.json (themes[]); those IDs flow through to
// the client via window.__TONEAI (set by app/layout.tsx).
//
// To add a built-in theme: append the id to BUILT_IN_THEME_IDS in
// lib/config.ts, add a `[data-theme="<id>"]` block in app/globals.css, and
// add the swatch metadata to THEMES in app/_Home.tsx.

// Theme is just a string — IDs come from runtime config and aren't known
// at compile time. Validation happens at runtime via the allowed set
// the server injects into window.__TONEAI.
// Amp-flavored palette ported from mighty-ai-qr-web: 10 voicings, each with a
// dark and a `-lt` light variant, plus dark/oled/light. CSS lives in
// app/globals.css under `[data-theme="<id>"]`; swatch metadata in app/_Home.tsx.
export type Theme =
  | 'dark' | 'oled' | 'light'
  | 'tweed' | 'tweed-lt' | 'amber' | 'amber-lt' | 'british' | 'british-lt'
  | 'oxblood' | 'oxblood-lt' | 'silver' | 'silver-lt' | 'pedalboard' | 'pedalboard-lt'
  | 'blackface' | 'blackface-lt' | 'plexi' | 'plexi-lt'

const THEME_KEY = 'katana_theme'
const DEFAULT_THEME: Theme = 'dark'

const VALID_THEMES = new Set<Theme>([
  'dark', 'oled', 'light',
  'tweed', 'tweed-lt', 'amber', 'amber-lt', 'british', 'british-lt',
  'oxblood', 'oxblood-lt', 'silver', 'silver-lt', 'pedalboard', 'pedalboard-lt',
  'blackface', 'blackface-lt', 'plexi', 'plexi-lt',
])

export function getTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const stored = localStorage.getItem(THEME_KEY) as Theme | null
  if (stored && VALID_THEMES.has(stored)) return stored
  // No saved preference: honor the operator's configured defaultTheme rather
  // than a hard-coded fallback. The pre-hydration bootstrap in layout.tsx has
  // already stamped that default onto <html data-theme> (from toneai.config
  // .json). Reading it back keeps the client in sync with the bootstrap —
  // otherwise React would override the configured default (e.g. oled) with
  // DEFAULT_THEME on mount, reverting a fresh visitor to dark.
  const bootstrapped = document.documentElement.getAttribute('data-theme') as Theme | null
  if (bootstrapped && VALID_THEMES.has(bootstrapped)) return bootstrapped
  return DEFAULT_THEME
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
}

// ─── Katana target device ────────────────────────────────────────────────────
//
// The `.kat` patch format is MODEL-SCOPED, not universal: the Katana Librarian
// app enumerates each generation (MkI / MkII / Gen 3) and cabinet variant
// (50 / 100 / Head / Artist / GO) as a distinct model with its own offset map
// and enum ordinals. The patch writer must know the target before it can place
// bytes. This selection is the amp the generated patch is built for.
//
// v1 ground truth is KATANA MkII (see docs/kat-format.md); other generations
// are listed but the writer widens to them only as each is proven against real
// exports. IDs mirror the app's model enum; labels are the retail names.

// One entry per GENERATION, not per cabinet variant. The .tsl format is
// generation-scoped: 50 / 100 / Head / Artist within a generation write a
// byte-identical liveset (same deviceString, same writer — see
// lib/patch/generations.ts). Those differences are hardware (wattage, speaker,
// Waza cab), not patch data, so a single "KATANA MkII" is the correct model.
export type KatanaDevice =
  | 'katana-mk1' | 'katana-mk2' | 'katana-mk3' | 'katana-air'
  | 'katana-go' | 'katana-go-bass' | 'katana-bass'
  | 'waza-air' | 'waza-air-bass'

// `supported` gates what the user can actually select. MkII and Gen 3 are both
// proven against real exports today; the others stay LISTED (so players see their
// amp is on the roadmap) but are not selectable, and the picker shows a note to
// that effect. Flip a row to true as each writer is proven.
//
/** Instrument a device is played with. First-class because it gates cross-device
 *  conversion: a guitar tone must never be converted to a bass rig or vice versa
 *  (different amps, EQ, voicing entirely). Dual-mode hardware (GO) is split into
 *  one device per instrument, so every entry is unambiguously one or the other. */
export type KatanaInstrument = 'guitar' | 'bass'

// MK1/MK2/MK3/GO mirror the guitar Katana Librarian's device selector. `katana-air`
// is the KATANA:AIR (its own BOSS Tone Studio app) — an effects-only .tsl (the amp
// is global panel state, so a generated Air tone ships amp settings as INSTRUCTIONS
// alongside the file; docs/air-format-notes.md). `katana-go` / `katana-go-bass` are
// the two MODES of the one dual-mode GO app (guitar verified; bass 'derived' — same
// block layout, bass vocabulary, pending a real bass export; docs/go-format-notes.md).
// `katana-bass` is the DESKTOP bass line (110 / 210 / Head) — its own architecture
// (Knob-panel preamp, colour-variation effects, combined Fx2 slot), verified against
// a real export (docs/katana-bass-format-notes.md).
export const KATANA_DEVICES: { id: KatanaDevice; label: string; instrument: KatanaInstrument; supported: boolean }[] = [
  { id: 'katana-mk2',     label: 'KATANA MkII',     instrument: 'guitar', supported: true  },
  { id: 'katana-mk3',     label: 'KATANA Gen 3',    instrument: 'guitar', supported: true  },
  { id: 'katana-air',     label: 'KATANA:AIR',      instrument: 'guitar', supported: true  },
  { id: 'katana-go',      label: 'KATANA:GO',       instrument: 'guitar', supported: true  },
  { id: 'katana-go-bass', label: 'KATANA:GO Bass',  instrument: 'bass',   supported: true  },
  { id: 'katana-bass',    label: 'KATANA Bass',     instrument: 'bass',   supported: true  },
  { id: 'katana-mk1',     label: 'KATANA MkI',      instrument: 'guitar', supported: true  },
  { id: 'waza-air',       label: 'WAZA-AIR',        instrument: 'guitar', supported: true  },
  { id: 'waza-air-bass',  label: 'WAZA-AIR Bass',   instrument: 'bass',   supported: true  },
]

const DEVICE_INSTRUMENT = new Map<KatanaDevice, KatanaInstrument>(
  KATANA_DEVICES.map(d => [d.id, d.instrument]),
)

/** The instrument a device is played with. Defaults to guitar for an unknown id
 *  (the overwhelming majority) and falls back to a `bass` substring so a future
 *  bass device is never mis-typed as guitar before its row is added. */
export function instrumentForDevice(device: KatanaDevice): KatanaInstrument {
  return DEVICE_INSTRUMENT.get(device) ?? (device.includes('bass') ? 'bass' : 'guitar')
}

// ─── Device × played-instrument rule ─────────────────────────────────────────
//
// Two axes, deliberately independent (docs — instrument-voicing rule):
//   • the DEVICE is the amp → it fixes the patch FORMAT (which .tsl gets written).
//   • the played INSTRUMENT (your active gear) → it drives the VOICING only.
// They are NOT symmetric, because the amps aren't:
//   • Guitar amps are general-purpose — a bass through a guitar KATANA is a real,
//     common rig. Guitar amp + guitar / bass / no gear are ALL allowed.
//   • Bass amps are purpose-built — a KATANA Bass only has bass preamp voices and
//     a bass-shaped EQ/effects set, so an electric guitar through it produces a
//     bass-voiced patch no guitarist wants. Bass amp + guitar gear is BLOCKED.
// A device must be chosen at all — there is no silent default at generate time.

/** The instrument the player is actually holding (their active gear's kind). */
export type PlayedInstrument = KatanaInstrument

export type DeviceInstrumentIssue =
  /** No (valid, supported) amp is selected — the writer has no target. */
  | { code: 'no-device' }
  /** A guitar is being played through a bass amp — not a supported combination. */
  | { code: 'guitar-on-bass-amp' }

/**
 * Validate a device against the instrument being played. Returns `null` when the
 * combination is allowed to generate, or an issue code when it must be blocked.
 * A null/absent `played` is always allowed — voicing then falls back to the amp's
 * own class. Shared by the client pre-submit guard and the server 400.
 */
export function deviceInstrumentIssue(
  device: KatanaDevice | null | undefined,
  played: PlayedInstrument | null | undefined,
): DeviceInstrumentIssue | null {
  if (!device || !SUPPORTED_DEVICES.has(device)) return { code: 'no-device' }
  if (instrumentForDevice(device) === 'bass' && played === 'guitar') {
    return { code: 'guitar-on-bass-amp' }
  }
  return null
}

/** User-facing, actionable copy for a blocked combination. Shared client+server
 *  so the pre-submit message and the server error read identically. */
export function deviceInstrumentIssueMessage(issue: DeviceInstrumentIssue): string {
  switch (issue.code) {
    case 'no-device':
      return 'Select an amp before generating a tone.'
    case 'guitar-on-bass-amp':
      return "A bass amp can't voice an electric guitar. Switch to a guitar KATANA, or set a bass as your active gear."
  }
}

const DEVICE_KEY = 'katana_device'
const DEFAULT_DEVICE: KatanaDevice = 'katana-mk2'

// Only supported devices are honoured — a stale non-MkII selection (or a hand-
// edited value) falls back to the MkII default, so the UI never sits on a device
// the writer can't build for.
const SUPPORTED_DEVICES = new Set<KatanaDevice>(
  KATANA_DEVICES.filter(d => d.supported).map(d => d.id),
)

export function getDefaultDevice(): KatanaDevice {
  if (typeof window === 'undefined') return DEFAULT_DEVICE
  const stored = localStorage.getItem(DEVICE_KEY) as KatanaDevice | null
  return stored && SUPPORTED_DEVICES.has(stored) ? stored : DEFAULT_DEVICE
}

export function saveDefaultDevice(device: KatanaDevice) {
  localStorage.setItem(DEVICE_KEY, device)
}

// ─── Anthropic API key (BYOK) ────────────────────────────────────────────────
//
// This app is Anthropic-only. Two modes, and the mode is DERIVED from the
// presence of a key — there is no stored mode flag to drift out of sync:
//
//   key absent  → "free"  — server's key, subject to the global daily quota
//   key present → "byok"  — this key, sent per-request, quota untouched
//
// The key lives here in localStorage and is sent on each request over TLS.
// Inference is server-side (the system prompt and tone-intent schema never
// reach the browser), so the server must treat it as a transient credential:
// never logged, never persisted, scrubbed from provider error objects.

const API_KEY_KEY = 'katana_anthropic_key'

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(API_KEY_KEY)
  return stored && stored.length > 0 ? stored : null
}

export function saveApiKey(key: string | null) {
  const trimmed = key?.trim() ?? ''
  if (trimmed.length > 0) localStorage.setItem(API_KEY_KEY, trimmed)
  else localStorage.removeItem(API_KEY_KEY)
}

// ─── Model preference: BYOK ONLY ─────────────────────────────────────────────
//
// This app is Anthropic-only, and on the FREE tier the model is a server decision
// — it spends the operator's key, so letting the client choose would let a caller
// bill an expensive model to us. The server ignores `model` on that path outright.
//
// A BYOK request is different: the caller's own key pays, so the choice is theirs
// and it costs the operator nothing. That preference is what this key stores. It
// is sent on every request, but the server only HONOURS it when a user key is
// present — so a stale value left behind after someone removes their key is inert
// rather than dangerous, which is why removing a key does not clear it.

const BYOK_MODEL_KEY = 'katana_byok_model'

/** The model a BYOK user picked, or null for "use the server's default". */
export function getByokModel(): string | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(BYOK_MODEL_KEY)
  return stored && stored.length > 0 ? stored : null
}

export function saveByokModel(model: string | null) {
  const trimmed = model?.trim() ?? ''
  if (trimmed.length > 0) localStorage.setItem(BYOK_MODEL_KEY, trimmed)
  else localStorage.removeItem(BYOK_MODEL_KEY)
}

// ─── Stored-state migration ──────────────────────────────────────────────────
//
// Browsers keep whatever the LAST build wrote, so a returning user arrives with
// storage shaped by a version we no longer ship. This is the one place that
// reconciles it. Called once on mount, before anything reads storage, and NOT
// behind any network call — an offline user must migrate too.
//
// Every step must be idempotent (it runs on every load) and must never throw:
// storage is not load-bearing, and a migration that breaks the app is worse
// than a stale key.
//
// Keys deliberately left alone: `katana_device`, `toneai_gear`, `toneai_tones`,
// `toneai_conversations` (unchanged schemas), `device_id` / `auth_token`
// (server-issued identity — clearing them would orphan a user's quota identity
// for no reason).

/** Keys written by builds that had settings this app no longer has. Each is
 *  dead: nothing reads them, and the features they configured are gone.
 *
 *  `toneai_models`         per-provider model pin — there is no model picker.
 *  `toneai_provider`       provider pin — the app is Anthropic-only.
 *  `toneai_system_prompt`  custom system prompt — the tone-designer prompt IS
 *                          the product; it is built server-side and the client
 *                          could never override it (the server never read it).
 *  `toneai_temperature`    per-conversation temperature — operator dial only.
 *
 *  Purge them rather than leave keys that look meaningful to whoever reads a
 *  user's storage next. */
const DEAD_KEYS = [
  'toneai_models',
  'toneai_provider',
  'toneai_system_prompt',
  'toneai_temperature',
]

export function migrateLocalStorage(): void {
  if (typeof window === 'undefined') return
  try {
    for (const k of DEAD_KEYS) localStorage.removeItem(k)
  } catch {
    /* private mode / quota errors — never break boot over a migration */
  }
}

// Web search is always on — it's core to tone accuracy, so there's no user
// toggle. The server offers the native search tool on every request and the
// model decides when to actually search (capped by TONEAI_WEB_SEARCH_MAX_USES).

// ─── TTS (text-to-speech) toggle ────────────────────────────────────────────
// Same persistence pattern as web search. When on, assistant responses are
// spoken via the Web Speech API once the stream completes. Default off
// (auto-speaking on every visit is invasive on shared devices).

const TTS_KEY = 'toneai_tts_enabled'

export function getTtsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(TTS_KEY) === '1'
}

export function setTtsEnabled(enabled: boolean) {
  if (enabled) localStorage.setItem(TTS_KEY, '1')
  else localStorage.removeItem(TTS_KEY)
}


// ─── Generation settings ─────────────────────────────────────────────────────
//
// There are no user-facing generation settings. The tone-designer system prompt
// and the tone schema ARE the product — they are built server-side and the
// client cannot override them (app/api/chat/route.ts). Temperature is an
// operator dial only (TONEAI_TEMPERATURE).
//
// The scaffold this app grew from exposed both as per-conversation overrides.
// Those chains survived here as dead code long after the settings UI for them
// was dropped: the client serialized a `systemPrompt` the server never read, and
// stored a `temperature` no UI could ever write. Both are gone.

// ─── No export / import / reset ──────────────────────────────────────────────
//
// The scaffold shipped all three. None was reachable here, and none is the right
// feature for this app:
//
//   exportAll / importConversationsJson — a JSON backup pair that covered
//     CONVERSATIONS ONLY: not the tone library, not the gear. In a chat app
//     conversations are the asset; here they aren't. A backup that restores
//     chats and loses a user's saved tones and instruments promises a safety it
//     doesn't deliver.
//
//   resetAllData — wiped every toneai_* key plus auth_token and device_id. It
//     had no caller and no button. Note what it did NOT do: reset the server's
//     quota. The daily pool is a global counter in SQLite keyed on the UTC date,
//     not per-device — so clearing storage never bought anyone free requests.
//
// To download a conversation, use conversationToMarkdown + downloadTextFile —
// that IS wired, and it's the transcript a user actually wants. If backup /
// restore or a "clear my data" control is ever wanted, design it deliberately to
// cover tones + gear + chats; don't resurrect these.
