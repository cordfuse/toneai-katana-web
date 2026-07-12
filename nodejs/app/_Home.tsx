'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { v4 as uuidv4 } from 'uuid'
import { sendChatStream, getQuota, initAuth, getProviders, getProviderModels, downloadDiagnostics, type AvailableProvider, type ProviderModel, type MultimodalMessage, type ContentBlock } from '@/lib/api'
import { installClientLogCapture } from '@/lib/log/client'
import {
  loadConversations, upsertConversation, deleteConversation, renameConversation,
  clearAllConversations, autoTitle, relativeTime, getTheme, saveTheme, type Theme,
  getDefaultDevice, saveDefaultDevice, KATANA_DEVICES, type KatanaDevice,
  deviceInstrumentIssue, deviceInstrumentIssueMessage,
  getApiKey, saveApiKey,
  getSelectedProvider, setSelectedProvider, getSelectedModel, setSelectedModel, migrateModelPrefs,
  getCustomSystemPrompt, setCustomSystemPrompt,
  getTemperature, setTemperature,
  exportAll, importConversationsJson, resetAllData,
  conversationToMarkdown, downloadTextFile,
  getTtsEnabled, setTtsEnabled,
  loadTones, addTone, deleteTone, renameTone, clearAllTones,
  tonesBackfilled, markTonesBackfilled,
  getWelcomeSeen, saveWelcomeSeen,
} from '@/lib/storage'
import type { ChatMessage, Conversation, Attachment, TonePatchResult, SavedTone } from '@/lib/types'
import { convertTone } from '@/lib/patch'
import { ToneCard, ToneModal } from './_ToneCard'
import { useT, useLocale, useAvailableLocales, setLocaleAndReload, labelForLocale } from '@/lib/i18n/client'
import {
  type GearState, type PositionChoice,
  loadGear, saveGear, activeInstrument, describeRig, positionsFor, positionLabel, equippedPickups,
} from '@/lib/gear'
import { sampleTonePrompts } from '@/lib/prompts'
import { GearSection, GearModal } from './_Gear'

// Patch attachment is hidden until every KATANA generation is supported — the
// importer parses .kat/.tsl for any device, but we only round-trip MkII, so
// accepting other patches would set a false expectation. Flip to true to bring
// the composer paperclip back once the other writers are verified.
const ATTACH_ENABLED = false

// ─── theme palette ───────────────────────────────────────────────────────────
//
// 15 popular dev themes (12 dark + 3 light). Each entry carries the three
// preview colors used by the SettingsPanel dropdown swatches: bg, primary, fg.
// CSS for each lives in app/globals.css under `[data-theme="<id>"]`.
// To add a theme: extend the Theme union in lib/storage.ts, add the CSS
// block, add the VALID_THEMES set entry, and add an entry here.

interface ThemeMeta {
  id: Theme
  label: string
  desc: string
  bg: string
  primary: string
  fg: string
}

// Amp-flavored palette ported from mighty-ai-qr-web. 10 voicings (Fender tweed,
// Marshall plexi/british, etc.), each with a dark + `-lt` light variant, plus
// plain dark/oled/light. CSS lives in app/globals.css under `[data-theme]`.
const THEMES: ThemeMeta[] = [
  // neutral
  { id: 'dark',          label: 'Dark',             desc: 'Google dark',      bg: '#202124', primary: '#8ab4f8', fg: '#e8eaed' },
  { id: 'oled',          label: 'OLED',             desc: 'Pure black',       bg: '#000000', primary: '#00bcd4', fg: '#e0e0e0' },
  { id: 'light',         label: 'Light',            desc: 'Clean light',      bg: '#f0f2f5', primary: '#1a73e8', fg: '#202124' },
  // amp voicings — dark
  { id: 'tweed',         label: 'Tweed',            desc: 'Fender warmth',    bg: '#221608', primary: '#d4a843', fg: '#f5e6c8' },
  { id: 'amber',         label: 'Amber',            desc: 'Tube glow',        bg: '#160f00', primary: '#ffab40', fg: '#ffe4a0' },
  { id: 'british',       label: 'British',          desc: 'Marshall green',   bg: '#0c1a0c', primary: '#c9a227', fg: '#e2edd6' },
  { id: 'oxblood',       label: 'Oxblood',          desc: 'Vintage tolex',    bg: '#180808', primary: '#e07070', fg: '#f5dede' },
  { id: 'silver',        label: 'Silver Panel',     desc: 'Boutique silver',  bg: '#1a1c1e', primary: '#b8a882', fg: '#dce3e8' },
  { id: 'pedalboard',    label: 'Pedalboard',       desc: 'Signal chain',     bg: '#0f1410', primary: '#5a9e4a', fg: '#c8d4c0' },
  { id: 'blackface',     label: 'Blackface',        desc: 'Fender silver',    bg: '#0a0e1a', primary: '#7eb8d4', fg: '#d8dff0' },
  { id: 'plexi',         label: 'Plexi',            desc: 'Marshall gold',    bg: '#1a1200', primary: '#d4930a', fg: '#f0e6c8' },
  // amp voicings — light
  { id: 'tweed-lt',      label: 'Tweed Light',      desc: 'Cream linen',      bg: '#efe9d6', primary: '#9a7418', fg: '#2e1a04' },
  { id: 'amber-lt',      label: 'Amber Light',      desc: 'Warm parchment',   bg: '#f5edcc', primary: '#c07800', fg: '#2a1c00' },
  { id: 'british-lt',    label: 'British Light',    desc: 'Sage panel',       bg: '#e8eddc', primary: '#7a6010', fg: '#101a06' },
  { id: 'oxblood-lt',    label: 'Oxblood Light',    desc: 'Blush cream',      bg: '#f0e4e4', primary: '#8a2020', fg: '#200808' },
  { id: 'silver-lt',     label: 'Silver Light',     desc: 'Platinum day',     bg: '#e8eaec', primary: '#7a6840', fg: '#16181a' },
  { id: 'pedalboard-lt', label: 'Pedalboard Light', desc: 'Military sage',    bg: '#dce8d8', primary: '#386820', fg: '#0c1c08' },
  { id: 'blackface-lt',  label: 'Blackface Light',  desc: 'Silver-blue day',  bg: '#d8e4f0', primary: '#1a5a9a', fg: '#060e1c' },
  { id: 'plexi-lt',      label: 'Plexi Light',      desc: 'Gold parchment',   bg: '#f0e8c8', primary: '#8a6000', fg: '#1c1000' },
]

const BUILT_IN_THEME_GROUPS: { label: string; ids: Theme[] }[] = [
  { label: 'Dark',  ids: ['dark','oled','tweed','amber','british','oxblood','silver','pedalboard','blackface','plexi'] },
  { label: 'Light', ids: ['light','tweed-lt','amber-lt','british-lt','oxblood-lt','silver-lt','pedalboard-lt','blackface-lt','plexi-lt'] },
]

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'

// Pre-hydration placeholder for the model picker only. The authoritative default
// is the provider registry's defaultModel (config/providers.yaml), fetched from
// /api/providers; this is what renders for the instant before that resolves.
const DEFAULT_MODEL_ID = 'claude-sonnet-4-6'

// Branding pulled from window.__TONEAI (injected by app/layout.tsx from
// the runtime toneai.config.json read). All fields fall back to "ToneAI Kat"
// defaults when window or the global aren't available (SSR, tests).
interface ToneaiBranding {
  name: string
  shortName: string
  icon192: string
  welcomeMessage: string
  checkForUpdatesUrl: string
  customThemes: { id: string; name: string; category: 'dark' | 'light'; swatches?: [string, string, string]; colors?: Record<string, string> }[]
  hideBuiltIns: boolean
}
function getToneaiBranding(): ToneaiBranding {
  if (typeof window === 'undefined') {
    return { name: 'ToneAI Kat', shortName: 'ToneAI Kat', icon192: '/branding/icon-192.png', welcomeMessage: '', checkForUpdatesUrl: '#', customThemes: [], hideBuiltIns: false }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (window as any).__TONEAI ?? {}
  return {
    name: w.name ?? 'ToneAI Kat',
    shortName: w.shortName ?? 'ToneAI Kat',
    icon192: typeof w.icon192 === 'string' ? w.icon192 : '/branding/icon-192.png',
    welcomeMessage: typeof w.welcomeMessage === 'string' ? w.welcomeMessage : '',
    checkForUpdatesUrl: w.checkForUpdatesUrl ?? '#',
    customThemes: Array.isArray(w.customThemes) ? w.customThemes : [],
    hideBuiltIns: !!w.hideBuiltInThemes,
  }
}


// ─── icons ───────────────────────────────────────────────────────────────────

// The UI shows no app icon — just the wordmark. The icon set (config/icons via
// /branding) still drives the PWA install prompt, home-screen shortcut, and
// browser tab; it's simply not rendered in-page.

// Up arrow, not a paper plane — pairs with StopIcon as a submit/halt toggle.
// Stroked rather than filled so it reads at the same visual weight as the
// solid square it swaps with.
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
)
const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
)
const NewChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/>
  </svg>
)
const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
)
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
)
const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
)
const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
)
const VolumeOnIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
)
const VolumeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
)
const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
)
const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
)
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
)
const EllipsisIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
)
const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
)
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
)
// Amp cabinet: outer shell, speaker cone, control knob.
const AmpIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="14" r="4"/><line x1="6.5" y1="6.5" x2="6.5" y2="6.5"/></svg>
)
// Guitar: body outline, soundhole/pickup, neck. Reads at 13px.
const GuitarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M11.5 12.5 20 4"/><path d="M18 2.5 21.5 6"/><circle cx="8" cy="16" r="5.5"/><circle cx="8" cy="16" r="1.6"/></svg>
)
const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
)
const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
)
const TrashSmIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
)
const EditMsgIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
)
const RefreshIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
)
const GlobeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
)
const AttachIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
)
const DocumentIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
)

// ─── code block with per-block copy button ───────────────────────────────────
//
// Used by ReactMarkdown's `components={{ pre: CodeBlock }}` override. We
// only override <pre> (fenced blocks), not inline <code>. The button sits
// absolutely in the top-right of the block. The actual code text is
// extracted from the child <code> element's children for clipboard.

function extractCodeText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractCodeText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props
    return extractCodeText(props?.children)
  }
  return ''
}

// Tables ship inside a horizontally-scrollable wrapper so wide GFM tables
// (3+ columns on mobile) don't blow past the bubble's right edge.
function TableBlock({ children }: { children?: React.ReactNode }) {
  return (
    <div className="my-2 -mx-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-semibold [&_th]:text-left [&_th]:text-fg [&_th]:border [&_th]:border-white/10 [&_th]:bg-surface-2 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:border [&_td]:border-white/10">
        {children}
      </table>
    </div>
  )
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractCodeText(children))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard denied */ }
  }
  // Button lives on the OUTER wrapper (not the <pre>) so it stays pinned
  // to the visible corner while the pre scrolls horizontally underneath.
  return (
    <div className="relative my-2">
      <button
        onClick={onCopy}
        aria-label={copied ? 'Copied code' : 'Copy code'}
        title={copied ? 'Copied' : 'Copy code'}
        className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-surface text-fg-3 hover:bg-surface-3 hover:text-fg transition-colors"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <pre>{children}</pre>
    </div>
  )
}

// ─── delete-confirm modal ────────────────────────────────────────────────────

function DeleteConfirmModal({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-surface shadow-2xl animate-scale-up p-5 space-y-4" onClick={e => e.stopPropagation()}>
          <h3 className="text-sm font-semibold text-fg">Delete {label}?</h3>
          <p className="text-xs text-fg-3">This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-xs text-fg-2 hover:text-fg transition-colors">Cancel</button>
            <button onClick={onConfirm} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">Delete</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── About modal ─────────────────────────────────────────────────────────────
//
// Opened by tapping the version label in the settings footer. Structure mirrors
// mighty-ai-qr-web's About screen: app identity, a collapsible per-version
// "What's new" changelog, and an author link. Keep WHATS_NEW newest-first and
// add an entry whenever a release ships user-visible changes.

const GITHUB_ICON_PATH = 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z'

const WHATS_NEW: { version: string; items: { text: string; sub?: string }[] }[] = [
  {
    version: '0.9.0',
    items: [
      { text: 'Your whole KATANA lineup — 9 amps', sub: 'From the original MkI to the wireless WAZA-AIR: MkI, MkII, Gen 3, KATANA:AIR, GO, GO Bass, KATANA Bass, WAZA-AIR, and WAZA-AIR Bass. Pick yours and design straight for it — every writer is verified byte-clean against a real export.' },
      { text: 'Bass, done right', sub: 'Dedicated bass amps (KATANA Bass, GO Bass, WAZA-AIR Bass) join the roster — and if you run a bass through a guitar KATANA, your tones are voiced for bass automatically.' },
      { text: 'Voicing follows your instrument', sub: 'Set a guitar or bass in My Gear and every patch is dialled for what’s in your hands, whatever amp you’re on. A guitar can’t be dialled for a bass amp, so the app steers you right.' },
      { text: 'Convert across the whole line', sub: 'Re-voice any saved tone for a different amp you own — guitar-to-guitar or bass-to-bass — and download it ready to import.' },
      { text: 'Headphone amps show their amp settings', sub: 'KATANA:AIR and WAZA-AIR store effects only, so the app hands you the exact amp voice and knob values to dial alongside the patch.' },
    ],
  },
  {
    version: '0.8.0',
    items: [
      { text: 'KATANA Gen 3 support', sub: 'Pick Gen 3 as your amp and design for it directly — its .tsl writer is verified byte-clean against real Gen 3 exports, with the Gen 3 amp voices and effects.' },
      { text: 'Convert a tone to your amp', sub: 'Got a tone built for a different KATANA than you play? Open it and convert — the patch is re-voiced for your amp, saved to My Tones, and ready to download.' },
    ],
  },
  {
    version: '0.7.3',
    items: [
      { text: 'ToneAI Kat is here', sub: 'Describe a song, an artist, or just a vibe — and get a ready-to-import .tsl patch for your BOSS KATANA MkII, straight into BOSS Tone Studio.' },
      { text: 'Patches you can trust', sub: 'A deterministic writer builds every .tsl and round-trips it against a real KATANA MkII export — the AI picks the tone, it never hand-writes the file.' },
      { text: 'Guitar and bass', sub: 'Set neck, bridge, or both so tones match the instrument in your hands.' },
      { text: 'My Gear and My Tones', sub: 'Save your instruments once, and keep every patch you generate to revisit, rename, and re-download.' },
      { text: 'Live artist and song search', sub: 'Looks up real tone references while it designs.' },
      { text: 'Free daily tier, or your own key', sub: 'Start free; add an Anthropic key in Settings for unlimited use.' },
      { text: 'Themes, OLED by default', sub: 'True-black UI out of the box — change it any time in Settings → Theme.' },
    ],
  },
]

function AboutModal({ onClose }: { onClose: () => void }) {
  const branding = getToneaiBranding()
  const [openVersions, setOpenVersions] = useState<Record<string, boolean>>({ [WHATS_NEW[0].version]: true })
  const toggle = (v: string) => setOpenVersions(prev => ({ ...prev, [v]: !prev[v] }))
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-surface shadow-2xl animate-scale-up p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src={branding.icon192} alt={branding.name} className="h-12 w-12 rounded-xl shrink-0" />
              <div>
                <p className="text-sm font-semibold text-fg">{branding.name} <span className="text-[11px] font-normal text-fg-4">v{APP_VERSION}</span></p>
                <p className="text-[11px] text-fg-4 mt-1 leading-relaxed">
                  Describe a sound in plain English — get a ready-to-import <code className="text-[10px]">.tsl</code> patch for your BOSS KATANA.
                </p>
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 text-fg-4 hover:text-fg transition-colors" aria-label="Close"><CloseIcon /></button>
          </div>

          {WHATS_NEW.map(({ version, items }) => {
            const open = !!openVersions[version]
            return (
              <div key={version} className="border-t border-white/10 pt-4">
                <button
                  onClick={() => toggle(version)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <p className="text-[11px] font-medium text-fg-3 uppercase tracking-wider">What&apos;s new in v{version}</p>
                  <ChevronIcon open={open} />
                </button>
                {open && (
                  <ul className="mt-2.5 space-y-2">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-primary mt-px shrink-0">•</span>
                        <div>
                          <span className={i === 0 ? 'text-[11px] font-medium text-fg' : 'text-[11px] text-fg-4'}>{item.text}</span>
                          {item.sub && <p className="text-[10px] text-fg-4 mt-0.5">{item.sub}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}

          <div className="border-t border-white/10 pt-4 space-y-1">
            <p className="text-[11px] font-medium text-fg-3 uppercase tracking-wider">Author</p>
            <a href="https://github.com/cordfuse/toneai-katana-web" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d={GITHUB_ICON_PATH} /></svg>
              github.com/cordfuse/toneai-katana-web
            </a>
            <p className="text-[10px] text-fg-4 pt-1">Steve Krisjanovs · Cordfuse</p>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-1">
            <p className="text-[11px] font-medium text-fg-3 uppercase tracking-wider">Credits</p>
            <p className="text-[11px] text-fg-4">Tone design by Claude (Anthropic). Patches are verified against a real KATANA MkII export before download — the model never writes the <code className="text-[10px]">.tsl</code> directly.</p>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Welcome banner ──────────────────────────────────────────────────────────
//
// Shown once per app version (gated by getWelcomeSeen/saveWelcomeSeen). Pulls
// its content from the newest WHATS_NEW entry so it stays in sync with the About
// screen — the first item is the headline highlight, the rest a bullet list.
// No settings toggle: dismissing simply records this version as seen.

function WelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  const branding = getToneaiBranding()
  const latest = WHATS_NEW[0]
  const [headline, ...rest] = latest.items
  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm animate-fade-in" />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-surface shadow-2xl animate-scale-up overflow-hidden flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="relative bg-primary/10 border-b border-primary/20 px-6 pt-5 pb-4 text-center shrink-0">
            <img src={branding.icon192} alt={branding.name} className="h-12 w-12 rounded-xl mx-auto mb-3 shadow-lg" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-0.5">What&apos;s new</p>
            <h2 className="text-xl font-bold text-fg">{branding.name} {latest.version}</h2>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-3 overflow-y-auto">
            {headline && (
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3">
                <p className="text-sm font-semibold text-fg mb-0.5">{headline.text}</p>
                {headline.sub && <p className="text-[11px] text-fg-3">{headline.sub}</p>}
              </div>
            )}
            {rest.length > 0 && (
              <ul className="space-y-2">
                {rest.map(({ text }) => (
                  <li key={text} className="flex items-start gap-2.5 text-[11px] text-fg-3 leading-relaxed">
                    <span className="shrink-0 text-primary leading-none mt-px">+</span>
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 pt-2 border-t border-white/10 shrink-0">
            <button
              onClick={onDismiss}
              className="w-full rounded-2xl bg-primary py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 active:opacity-80 transition-opacity shadow-lg"
            >
              Let&apos;s go →
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── settings panel (right drawer) ───────────────────────────────────────────

// ─── Free-tier quota pill ───────────────────────────────────────────────────
//
// Shows what's left of the GLOBAL daily pool (shared across all users), so it
// polls: another user's request moves this number without us doing anything.
//
// `optimistic` is the count of requests this client has submitted but not yet
// seen reflected in a server response. The pill subtracts it so the number
// drops the instant you hit send, rather than when the stream finishes —
// mighty-ai-qr-web refreshes only after the response lands, which reads as a
// frozen counter on a slow generation. The server's number always wins on the
// next poll, so drift self-corrects.
function QuotaPill({ version, optimistic }: { version: number; optimistic: number }) {
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null)

  const fetchQuota = useCallback(() => {
    getQuota().then(q => setQuota({ remaining: q.remaining, limit: q.limit })).catch(() => {})
  }, [])

  useEffect(() => { fetchQuota() }, [fetchQuota, version])
  useEffect(() => {
    const id = setInterval(fetchQuota, 30_000)
    return () => clearInterval(id)
  }, [fetchQuota])

  if (!quota) return null

  const remaining = Math.max(0, quota.remaining - optimistic)
  const low = remaining <= Math.max(1, Math.floor(quota.limit * 0.05))
  const empty = remaining === 0

  return (
    <div
      title={empty
        ? 'The shared free-request pool is empty. It refills at midnight UTC — or add your own Anthropic API key in Settings.'
        : `${remaining} of ${quota.limit} free requests left today, shared across all users. Refills at midnight UTC.`}
      className={`flex items-center rounded-xl border px-2.5 h-8 text-xs font-medium select-none tabular-nums transition-colors ${
        empty || low
          ? 'border-red-500/40 text-red-400'
          : 'border-white/10 bg-surface-2 text-fg-4'
      }`}
    >
      {remaining} left
    </div>
  )
}

function SettingsPanel({
  theme, onTheme,
  device, onDevice,
  apiKey, onApiKey,
  gear, onGear,
  onClose,
}: {
  theme: Theme
  onTheme: (t: Theme) => void
  device: KatanaDevice
  onDevice: (d: KatanaDevice) => void
  apiKey: string | null
  onApiKey: (k: string | null) => void
  gear: GearState
  onGear: (g: GearState) => void
  onClose: () => void
}) {
  const [closing, setClosing] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [deviceOpen, setDeviceOpen] = useState(false)
  const [localeOpen, setLocaleOpen] = useState(false)
  const [gearModalOpen, setGearModalOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  // Local draft so typing doesn't write to localStorage on every keystroke.
  // Commits on blur, same pattern the system-prompt textarea used.
  const [keyDraft, setKeyDraft] = useState(apiKey ?? '')
  const [keyVisible, setKeyVisible] = useState(false)
  const [loggingBusy, setLoggingBusy] = useState(false)
  const t = useT()
  const activeLocale = useLocale()
  const availableLocales = useAvailableLocales()

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 240)
  }

  // Merge built-in themes with any custom themes from toneai.config.json
  // (read at runtime via window.__TONEAI). Custom themes are appended to the
  // built-in groups by category; if hideBuiltIns is true, only customs show.
  const branding = getToneaiBranding()
  // Themes are the fixed amp palette — no runtime/config-driven custom themes.
  const THEMES_LIVE: ThemeMeta[] = THEMES
  const THEME_GROUPS_LIVE: { label: string; ids: Theme[] }[] = BUILT_IN_THEME_GROUPS

  const active = THEMES_LIVE.find(t => t.id === theme) ?? THEMES_LIVE[0]
  const activeDevice = KATANA_DEVICES.find(d => d.id === device) ?? KATANA_DEVICES[0]

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 animate-fade-in" onClick={handleClose} />
      <aside className={`fixed right-0 top-0 z-50 flex h-full w-[min(20rem,100vw)] flex-col bg-surface shadow-2xl ${closing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-medium text-fg">{t('settings.title', 'Settings')}</h2>
          <button onClick={handleClose} className="text-fg-3 hover:text-fg transition-colors" aria-label={t('settings.close', 'Close settings')}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Theme */}
          <div>
            <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-2">{t('settings.theme', 'Theme')}</p>
            <div className="relative">
              <button
                onClick={() => setThemeOpen(o => !o)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors"
              >
                <div className="flex gap-1 shrink-0">
                  <div style={{ background: active.bg }} className="h-3 w-3 rounded-sm border border-white/10" />
                  <div style={{ background: active.primary }} className="h-3 w-3 rounded-sm" />
                  <div style={{ background: active.fg, opacity: 0.7 }} className="h-3 w-3 rounded-sm" />
                </div>
                <span className="flex-1 text-left">{active.label}</span>
                <span className="text-[10px] text-fg-4 truncate max-w-[8rem]">{active.desc}</span>
                <ChevronIcon open={themeOpen} />
              </button>
              {themeOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setThemeOpen(false)} />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto animate-dropdown origin-top">
                    {THEME_GROUPS_LIVE.map(group => (
                      <div key={group.label}>
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-4 bg-surface">{group.label}</p>
                        {group.ids.map(id => {
                          const t = THEMES_LIVE.find(x => x.id === id)
                          if (!t) return null
                          const isActive = theme === t.id
                          return (
                            <button
                              key={t.id}
                              onClick={() => { onTheme(t.id); setThemeOpen(false) }}
                              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                                isActive ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                              }`}
                            >
                              <div className="flex gap-1 shrink-0">
                                <div style={{ background: t.bg }} className="h-3 w-3 rounded-sm border border-white/10" />
                                <div style={{ background: t.primary }} className="h-3 w-3 rounded-sm" />
                                <div style={{ background: t.fg, opacity: 0.7 }} className="h-3 w-3 rounded-sm" />
                              </div>
                              <span className="flex-1 text-left">{t.label}</span>
                              <span className="text-[10px] opacity-50 truncate max-w-[6rem]">{t.desc}</span>
                              {isActive && <span className="ml-1 text-primary shrink-0">✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Katana device — the amp the generated patch targets */}
          <div>
            <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-2">Amp Model</p>
            <div className="relative">
              <button
                onClick={() => setDeviceOpen(o => !o)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors"
              >
                <span className="flex-1 text-left">{activeDevice.label}</span>
                <ChevronIcon open={deviceOpen} />
              </button>
              {deviceOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDeviceOpen(false)} />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto animate-dropdown origin-top">
                    {KATANA_DEVICES.map(d => {
                      const isActive = device === d.id
                      // Unsupported devices are listed but not yet selectable —
                      // their writers aren't proven against real exports yet.
                      if (!d.supported) {
                        return (
                          <div
                            key={d.id}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg-4 cursor-not-allowed select-none"
                            title="Not yet supported — its .tsl writer is still being verified"
                          >
                            <span className="flex-1 text-left">{d.label}</span>
                            <span className="ml-1 shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-fg-4">Soon</span>
                          </div>
                        )
                      }
                      return (
                        <button
                          key={d.id}
                          onClick={() => { onDevice(d.id); setDeviceOpen(false) }}
                          className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                            isActive ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                          }`}
                        >
                          <span className="flex-1 text-left">{d.label}</span>
                          {isActive && <span className="ml-1 text-primary shrink-0">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-fg-4">
              Models marked “Soon” are listed but not yet selectable — support lands
              as each generation’s .tsl writer is verified against real exports.
            </p>
          </div>

          {/* Language */}
          {availableLocales.length > 1 && (
            <div>
              <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-2">{t('settings.language', 'Language')}</p>
              <div className="relative">
                <button
                  onClick={() => setLocaleOpen(o => !o)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors"
                >
                  <span className="flex-1 text-left">{labelForLocale(activeLocale)}</span>
                  <span className="text-[10px] text-fg-4 uppercase">{activeLocale}</span>
                  <ChevronIcon open={localeOpen} />
                </button>
                {localeOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setLocaleOpen(false)} />
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto animate-dropdown origin-top">
                      {availableLocales.map(code => {
                        const isActive = code === activeLocale
                        return (
                          <button
                            key={code}
                            onClick={() => { setLocaleOpen(false); setLocaleAndReload(code) }}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                              isActive ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                            }`}
                          >
                            <span className="flex-1 text-left">{labelForLocale(code)}</span>
                            <span className="text-[10px] opacity-60 uppercase">{code}</span>
                            {isActive && <span className="ml-1 text-primary shrink-0">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* My gear — Tier 2. Model bias only; never reaches the writer.
           *  The instrument is persistent; pickup POSITION is per-request and
           *  lives in the composer, not here (docs/settings.md § Tier 2). */}
          <GearSection
            gear={gear}
            onSelect={id => onGear({ ...gear, activeInstrumentId: id })}
            onManage={() => setGearModalOpen(true)}
          />

          {/* Anthropic API key — BYOK.
           *  Presence of a key IS the mode toggle: absent → free tier (server
           *  key, global daily quota); present → this key, quota untouched.
           *  Inference stays server-side either way, so the key is sent per
           *  request rather than used from the browser. */}
          <div>
            <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-2">Anthropic API Key</p>
            <div className="relative">
              <input
                type={keyVisible ? 'text' : 'password'}
                value={keyDraft}
                onChange={e => setKeyDraft(e.target.value)}
                onBlur={() => onApiKey(keyDraft.trim().length > 0 ? keyDraft.trim() : null)}
                placeholder="sk-ant-…  (optional)"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 pr-16 text-xs font-mono text-fg placeholder:text-fg-4 placeholder:font-sans outline-none focus:ring-1 focus:ring-primary/40"
              />
              {keyDraft.length > 0 && (
                <button
                  onClick={() => setKeyVisible(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-1 text-[10px] uppercase tracking-wider text-fg-4 hover:text-fg-2 transition-colors"
                >
                  {keyVisible ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-fg-4 leading-relaxed">
              {apiKey
                ? 'Using your key — no daily limit. Stored in this browser only.'
                : 'Free mode — shared daily limit across all users. Add a key to lift it.'}
            </p>
            {apiKey && (
              <button
                onClick={() => { setKeyDraft(''); setKeyVisible(false); onApiKey(null) }}
                className="mt-1 text-[10px] text-fg-4 hover:text-fg-2 transition-colors"
              >
                Remove key → use free mode
              </button>
            )}
          </div>

          {/* Diagnostics — download a single .txt of client + server events for
              this browser, for reporting issues. Contains your prompts and the
              tones generated; secrets are scrubbed out before it is written. */}
          <div>
            <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-2">
              {t('settings.diagnostics', 'Diagnostics')}
            </p>
            <button
              onClick={async () => {
                setLoggingBusy(true)
                try { await downloadDiagnostics() } finally { setLoggingBusy(false) }
              }}
              disabled={loggingBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg-2 hover:text-fg hover:bg-surface-3 transition-colors disabled:opacity-50"
            >
              {loggingBusy
                ? t('settings.logDownloading', 'Preparing…')
                : t('settings.downloadLog', 'Download log')}
            </button>
            <p className="mt-1.5 text-[10px] text-fg-4 leading-relaxed">
              {t('settings.logHint', 'Includes your prompts and generated tones. Send it with a bug report. No API keys are included.')}
            </p>
          </div>
        </div>

        <div className="px-5 py-3 flex items-center justify-end text-xs text-fg-4">
          <button
            onClick={() => setAboutOpen(true)}
            className="hover:text-fg-2 transition-colors underline decoration-dotted decoration-fg-4/40 underline-offset-2"
            title={t('settings.about', 'About')}
          >
            {branding.name} v{APP_VERSION}
          </button>
        </div>
      </aside>
      {gearModalOpen && (
        <GearModal gear={gear} onSave={onGear} onClose={() => setGearModalOpen(false)} />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  )
}

// ─── conversation list item ─────────────────────────────────────────────────

function ConvItem({ conv, active, onSelect, onDeleteRequest, onRename }: {
  conv: Conversation
  active: boolean
  onSelect: () => void
  onDeleteRequest: () => void
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(conv.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== conv.title) onRename(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className={`relative flex items-center px-3 py-2 ${active ? 'bg-surface-2' : ''}`}>
        {active && <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />}
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 min-w-0 bg-transparent text-xs text-fg outline-none border-b border-primary py-0.5"
        />
      </div>
    )
  }

  return (
    <div
      className={`group relative flex items-center px-3 py-2.5 cursor-pointer transition-colors ${active ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
      onClick={onSelect}
    >
      {active && <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-fg">{conv.title}</p>
        <p className="text-[10px] text-fg-4">{relativeTime(conv.updatedAt)}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); setName(conv.title); setEditing(true); requestAnimationFrame(() => inputRef.current?.focus()) }}
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center text-fg-4 hover:text-fg-2 transition-colors"
        title="Rename"
      >
        <PencilIcon />
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDeleteRequest() }}
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center text-fg-4 hover:text-fg-2 transition-colors"
        title="Delete"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

// ─── tone library list item ─────────────────────────────────────────────────

// Mirrors ConvItem: inline rename, delete, click-to-open. The row opens the
// tone's detail modal (download + go-to-chat live there).
function ToneItem({ tone, onOpen, onDeleteRequest, onRename }: {
  tone: SavedTone
  onOpen: () => void
  onDeleteRequest: () => void
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tone.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== tone.name) onRename(trimmed)
    setEditing(false)
  }

  const amp = tone.tone.patch.ampA?.type
  const subtitle = [amp, tone.tone.deviceLabel].filter(Boolean).join(' · ')

  if (editing) {
    return (
      <div className="relative flex items-center px-3 py-2">
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 min-w-0 bg-transparent text-xs text-fg outline-none border-b border-primary py-0.5"
        />
      </div>
    )
  }

  return (
    <div
      className="group relative flex items-center px-3 py-2.5 cursor-pointer transition-colors hover:bg-surface-2"
      onClick={onOpen}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-fg">{tone.name}</p>
        <p className="truncate text-[10px] text-fg-4">{subtitle || relativeTime(tone.updatedAt)}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); setName(tone.name); setEditing(true); requestAnimationFrame(() => inputRef.current?.focus()) }}
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center text-fg-4 hover:text-fg-2 transition-colors"
        title="Rename"
      >
        <PencilIcon />
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDeleteRequest() }}
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center text-fg-4 hover:text-fg-2 transition-colors"
        title="Delete"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

// ─── sidebar (left drawer) ───────────────────────────────────────────────────

function Sidebar({
  visible, onClose, conversations, activeId, query, setQuery,
  onSelectConv, onDeleteConv, onRenameConv, onClearAll,
  tab, onTab, tones, onOpenTone, onDeleteTone, onRenameTone, onClearAllTones,
  appName, showClearAll,
}: {
  visible: boolean
  onClose: () => void
  conversations: Conversation[]
  activeId: string | null
  query: string
  setQuery: (q: string) => void
  onSelectConv: (id: string) => void
  onDeleteConv: (id: string, title: string) => void
  onRenameConv: (id: string, title: string) => void
  onClearAll: () => void
  tab: 'chats' | 'tones'
  onTab: (t: 'chats' | 'tones') => void
  tones: SavedTone[]
  onOpenTone: (tone: SavedTone) => void
  onDeleteTone: (id: string, name: string) => void
  onRenameTone: (id: string, name: string) => void
  onClearAllTones: () => void
  showClearAll: boolean
  appName: string
}) {
  const t = useT()
  const q = query.trim().toLowerCase()
  const filtered = q
    ? conversations.filter(c => c.title.toLowerCase().includes(q) ||
        c.messages.some(m => m.content.toLowerCase().includes(q)))
    : conversations
  const filteredTones = q
    ? tones.filter(t2 => t2.name.toLowerCase().includes(q) ||
        (t2.prompt?.toLowerCase().includes(q) ?? false) ||
        (t2.tone.patch.ampA?.type?.toLowerCase().includes(q) ?? false))
    : tones

  return (
    <>
      {visible && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-fade-in" onClick={onClose} />}
      <aside className={`
        fixed top-0 left-0 z-50 h-full bg-surface shadow-[4px_0_16px_rgba(0,0,0,0.35)]
        flex flex-col overflow-hidden transition-transform duration-200 w-[260px]
        lg:relative lg:shadow-none
        ${visible ? 'translate-x-0' : '-translate-x-full lg:w-0'}
      `}>
        {/* brand + close (mobile) */}
        <div className="flex items-center justify-between px-3 py-3 shrink-0 min-w-[260px]">
          <div className="flex items-center gap-2.5">
            <img src={getToneaiBranding().icon192} alt="" className="h-8 w-8 rounded-lg shrink-0" />
            <span className="text-sm font-medium text-fg whitespace-nowrap">{appName}</span>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg transition-colors lg:hidden" aria-label={t('sidebar.closeSidebar', 'Close sidebar')}>
            <CloseIcon />
          </button>
        </div>

        {/* Chats | Tones toggle. Clear-all on the right acts on the active tab. */}
        <div className="flex items-center border-b border-white/10 ml-3 mr-[17px] h-9">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onTab('chats')}
              className={`text-xs font-medium transition-colors ${tab === 'chats' ? 'text-fg' : 'text-fg-4 hover:text-fg-2'}`}
            >
              {t('sidebar.chats', 'Chats')}
            </button>
            <button
              onClick={() => onTab('tones')}
              className={`text-xs font-medium transition-colors ${tab === 'tones' ? 'text-fg' : 'text-fg-4 hover:text-fg-2'}`}
            >
              {t('sidebar.tones', 'Tones')}
            </button>
          </div>
          <div className="flex-1" />
          {showClearAll && tab === 'chats' && conversations.length > 0 && (
            <button
              onClick={onClearAll}
              title="Clear all conversations"
              aria-label="Clear all conversations"
              className="flex h-7 w-7 items-center justify-center text-fg-4 hover:text-red-400 transition-colors"
            >
              <TrashIcon />
            </button>
          )}
          {showClearAll && tab === 'tones' && tones.length > 0 && (
            <button
              onClick={onClearAllTones}
              title="Clear all tones"
              aria-label="Clear all tones"
              className="flex h-7 w-7 items-center justify-center text-fg-4 hover:text-red-400 transition-colors"
            >
              <TrashIcon />
            </button>
          )}
        </div>

        {/* search */}
        <div className="px-3 pt-2 pb-2 shrink-0 min-w-[260px]">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-4 pointer-events-none"><SearchIcon /></span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={tab === 'tones' ? t('sidebar.searchTones', 'Search tones…') : t('sidebar.searchPlaceholder', 'Search chats…')}
              className="w-full rounded-lg bg-surface-2 py-1.5 pl-7 pr-7 text-xs text-fg placeholder:text-fg-4 outline-none focus:ring-1 focus:ring-primary/40"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-2 transition-colors" aria-label="Clear search">
                <CloseIcon />
              </button>
            )}
          </div>
        </div>

        {/* list — chats or tones */}
        <div className="flex-1 overflow-y-auto py-1 [scrollbar-gutter:stable]">
          {tab === 'chats' ? (
            filtered.length === 0
              ? <p className="px-4 py-6 text-center text-[11px] text-fg-4">{q ? t('sidebar.noMatches', 'No matches') : t('sidebar.noConversations', 'No conversations yet')}</p>
              : filtered.map(conv => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeId}
                  onSelect={() => { onSelectConv(conv.id); onClose() }}
                  onDeleteRequest={() => onDeleteConv(conv.id, conv.title)}
                  onRename={name => onRenameConv(conv.id, name)}
                />
              ))
          ) : (
            filteredTones.length === 0
              ? <p className="px-4 py-6 text-center text-[11px] text-fg-4">{q ? t('sidebar.noMatches', 'No matches') : t('sidebar.noTones', 'No tones yet — generate one and it lands here')}</p>
              : filteredTones.map(tn => (
                <ToneItem
                  key={tn.id}
                  tone={tn}
                  onOpen={() => onOpenTone(tn)}
                  onDeleteRequest={() => onDeleteTone(tn.id, tn.name)}
                  onRename={name => onRenameTone(tn.id, name)}
                />
              ))
          )}
        </div>

      </aside>
    </>
  )
}

// ─── message bubble ──────────────────────────────────────────────────────────

function MessageItem({ msg, streaming, isLastAssistant, onEditAndResend, onRegenerate, showActions, showSources, onOpenTone }: {
  msg: ChatMessage
  streaming: boolean
  isLastAssistant: boolean
  onEditAndResend: (id: string, newContent: string) => void
  onRegenerate: () => void
  showActions: boolean
  showSources: boolean
  onOpenTone?: (tone: TonePatchResult) => void
}) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msg.content)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  const copy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const startEdit = () => {
    setDraft(msg.content)
    setEditing(true)
    requestAnimationFrame(() => {
      const el = editTextareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    })
  }
  const cancelEdit = () => { setEditing(false); setDraft(msg.content) }
  const saveEdit = () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === msg.content) { cancelEdit(); return }
    setEditing(false)
    onEditAndResend(msg.id, trimmed)
  }

  if (msg.role === 'user') {
    const actions = showActions && !editing && !streaming && (
      <div
        className="flex gap-2 opacity-60 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity mb-1"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={copy} title={copied ? 'Copied' : 'Copy'} className="text-fg-4 hover:text-fg-2 transition-colors">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <button onClick={startEdit} title="Edit & resend" className="text-fg-4 hover:text-fg-2 transition-colors">
          <EditMsgIcon />
        </button>
      </div>
    )
    return (
      <div className="group flex items-end justify-end gap-1.5">
        {actions}
        {editing ? (
          <div className="w-full max-w-[85%] rounded-2xl border border-primary/40 bg-surface p-2">
            <textarea
              ref={editTextareaRef}
              value={draft}
              onChange={e => {
                setDraft(e.target.value)
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 200) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
              }}
              className="w-full resize-none bg-transparent text-sm text-fg outline-none px-2 pt-1"
              style={{ minHeight: '2rem', maxHeight: '200px' }}
            />
            <div className="flex items-center justify-end gap-2 px-1 pt-1">
              <button onClick={cancelEdit} className="px-2.5 py-1 text-xs text-fg-3 hover:text-fg transition-colors">Cancel</button>
              <button
                onClick={saveEdit}
                disabled={!draft.trim() || draft.trim() === msg.content}
                className="px-2.5 py-1 text-xs rounded-lg bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-on-primary whitespace-pre-wrap break-words space-y-2">
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {msg.attachments.map((att, i) => att.kind === 'image' && att.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={att.dataUrl} alt={att.name} className="max-h-40 rounded-lg border border-white/10 object-cover" />
                ) : (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-on-primary/10 px-2 py-1 text-[11px]">
                    <DocumentIcon /> {att.name}
                  </div>
                ))}
              </div>
            )}
            {msg.content && <div>{msg.content}</div>}
          </div>
        )}
      </div>
    )
  }

  const isEmptyStreaming = msg.content.length === 0 && streaming
  // Regenerate is only offered on the LAST assistant message, and only
  // when we're not currently streaming (otherwise it's mid-flight).
  const actions = showActions && !isEmptyStreaming && (
    <div
      className="flex gap-2 opacity-60 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity mb-1"
      onClick={e => e.stopPropagation()}
    >
      <button onClick={copy} title={copied ? 'Copied' : 'Copy'} className="text-fg-4 hover:text-fg-2 transition-colors">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      {isLastAssistant && !streaming && (
        <button onClick={onRegenerate} title="Regenerate response" className="text-fg-4 hover:text-fg-2 transition-colors">
          <RefreshIcon />
        </button>
      )}
    </div>
  )

  return (
    <div className="group flex flex-col items-start gap-0.5">
      <div className="flex items-end gap-1.5 max-w-full">
        <div className="toneai-assistant-bubble min-w-0 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-fg">
          {isEmptyStreaming ? (
            <span className="inline-flex gap-1 items-end h-4">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-3" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-3" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-3" />
            </span>
          ) : (
            <div className="prose prose-sm max-w-none [&>*]:my-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-surface-2 [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock, table: TableBlock }}>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {actions}
      </div>
      {/* Web search sources first, then the tone card — the .tsl is the payoff
          and should sit closest to the composer, under its supporting sources. */}
      {showSources && msg.sources && msg.sources.length > 0 && (
        <div className="ml-1 mt-1 max-w-[85%] rounded-xl bg-surface px-3 py-2 border-l border-primary/30">
          <div className="text-[10px] text-fg-3 mb-1 uppercase tracking-wider">Sources</div>
          <ul className="space-y-1.5">
            {msg.sources.map((s, i) => {
              let host = ''
              try { host = new URL(s.url).hostname } catch { /* malformed URL — skip favicon */ }
              return (
                <li key={i} className="flex items-center gap-2 text-xs">
                  {host && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
                      alt=""
                      width={16}
                      height={16}
                      className="shrink-0 rounded-sm"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                    />
                  )}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 truncate text-primary hover:underline"
                    title={s.url}
                  >
                    {s.title || host || s.url}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {msg.tonePatch && (
        <ToneCard tone={msg.tonePatch} onOpen={() => onOpenTone?.(msg.tonePatch!)} />
      )}
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function Home({
  initialConvId,
  appName = 'ToneAI Kat',
  welcomeMessage = '',
  starterPrompts = [],
}: {
  initialConvId?: string
  appName?: string
  welcomeMessage?: string
  starterPrompts?: string[]
} = {}) {
  const t = useT()
  const locale = useLocale()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  // Five random tone prompts for the empty state. Starts empty so the server
  // and the first client render agree; the mount effect below fills it.
  const [suggestions, setSuggestions] = useState<string[]>([])
  // Bumped on every "New chat". Relying on activeId/messages to change is not
  // enough: hitting New chat while already on an empty new chat moves neither,
  // so the effect would skip and re-show the same five chips.
  const [starterRoll, setStarterRoll] = useState(0)
  // The generated tone open in the detail modal, if any. Carries the source
  // conversation id so the modal can offer "Go to chat" when opened from the
  // tone library.
  const [openTone, setOpenTone] = useState<{ tone: TonePatchResult; conversationId: string | null } | null>(null)
  // My Tones library — a client-side store independent of conversations.
  const [tones, setTones] = useState<SavedTone[]>([])
  // Which list the left drawer shows.
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'tones'>('chats')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sidebar visibility: default collapsed on mobile, open on lg+ (CSS handles
  // the lg:relative override; we just track the boolean).
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  // Welcome banner: shown once per app version. Starts false so SSR and first
  // client paint agree; the mount effect flips it on when the stored "seen"
  // version differs from the running one (i.e. a new release dropped).
  const [showWelcome, setShowWelcome] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const [device, setDevice] = useState<KatanaDevice>('katana-mk2')
  // null → free mode (server key + global quota). Hydrated client-side; stays
  // null during SSR so the first paint never differs from the server's.
  const [apiKey, setApiKey] = useState<string | null>(null)
  // Tier 2 gear. Hydrated client-side (localStorage) like theme/apiKey.
  const [gear, setGear] = useState<GearState>({ instruments: [], activeInstrumentId: null })
  // Pickup position is per-request and deliberately NOT persisted. 'auto' lets
  // the model choose from the positions the active instrument actually has.
  const [position, setPosition] = useState<PositionChoice>('auto')
  // Quota pill: `quotaVersion` forces a re-fetch; `optimisticSpend` counts
  // requests submitted but not yet reconciled with a server response.
  const [quotaVersion, setQuotaVersion] = useState(0)
  const [optimisticSpend, setOptimisticSpend] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<{ label: string; doDelete: () => void } | null>(null)
  const [search, setSearch] = useState('')
  const [providers, setProviders] = useState<AvailableProvider[]>([])
  // Whether the server can serve free-tier requests (has its own key). Default
  // true so the quota pill shows on a normal deployment; flipped off only when
  // the server reports no key, so we don't advertise free requests that 503.
  const [freeTierAvailable, setFreeTierAvailable] = useState(true)
  const [toolRunning, setToolRunning] = useState<{ name: string; query?: string } | null>(null)
  // Generation settings: null = use server default. UI shows a placeholder
  // hint when unset so user knows what value will actually be used.
  const [customSystemPrompt, setCustomSystemPromptState] = useState<string | null>(null)
  const [customTemperature, setCustomTemperatureState] = useState<number | null>(null)
  // Anthropic-only app: provider is fixed, and neither is user-selectable.
  // Both are still sent on the wire so the server can validate them against
  // config/providers.yaml rather than silently accepting anything.
  const [provider, setProviderState] = useState<string>('anthropic')
  // Pre-hydration placeholder only; replaced by the provider's real defaultModel
  // (env-driven, Sonnet) once /api/providers resolves.
  const [model, setModelState] = useState<string>(DEFAULT_MODEL_ID)
  const [modelOpen, setModelOpen] = useState(false)
  // Live model list per provider id — populated lazily when the dropdown
  // opens. For local providers this is the actual installed-models list
  // returned by the local server's /v1/models endpoint.
  const [liveModels, setLiveModels] = useState<Record<string, ProviderModel[]>>({})
  const [liveModelsLoading, setLiveModelsLoading] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  // Voice — STT (mic capture → textarea) and TTS (speak assistant
  // replies). Capability is browser-determined; the UI hides each control
  // if the underlying API isn't available, so we don't fire blank buttons.
  const [voiceInputAvailable, setVoiceInputAvailable] = useState(false)
  const [voiceOutputAvailable, setVoiceOutputAvailable] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [ttsEnabled, setTtsEnabledState] = useState(false)
  const patchInputRef = useRef<HTMLInputElement>(null)
  const importJsonRef = useRef<HTMLInputElement>(null)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initialized = useRef(false)
  // Voice refs — recognition instance for STT (so toggleListening can
  // .stop() the in-flight one), final transcript buffer (accumulates
  // across interim results), and a TTS-enabled ref so the streaming
  // completion handler reads the current value without a state-stale
  // closure trap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  const ttsEnabledRef = useRef(false)
  // The chosen English voice. Never speak with the engine default: on Android
  // the default can be any locale (an Assamese default was what broke this),
  // and an utterance routed to a voice with no data installed dies with
  // `synthesis-failed` no matter how short it is.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  // Always-current send() — refreshed on every render so the
  // SpeechRecognition onend callback (defined inside a useCallback with
  // its own stale closure on `input`) can invoke the up-to-date send.
  const sendRef = useRef<(() => void) | null>(null)

  // ── init ──
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    // Start diagnostic capture as early as possible so errors during init are
    // recorded too (console.error tap + global error/rejection listeners).
    installClientLogCapture()
    // Register the service worker so Chrome considers the app installable.
    // /sw.js is a minimal SW (fetch handler, no caching) — its presence is
    // what unlocks the "Install app" prompt; without it, "Add to home
    // screen" only creates a plain shortcut. We surface failures to the
    // console so PWA-install regressions are debuggable (was silent before
    // and that hid real errors). Doesn't throw — the chat works regardless.
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.info('[toneai] SW registered, scope:', reg.scope))
        .catch(err => console.warn('[toneai] SW registration failed:', err))
    }
    const t = getTheme()
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)
    setDevice(getDefaultDevice())
    setApiKey(getApiKey())
    setGear(loadGear())

    // Voice capability probes. Web Speech API: SpeechRecognition (input)
    // and SpeechSynthesis (output). Both gated separately because some
    // browsers ship one without the other (Safari has TTS but limited
    // STT, Firefox the reverse).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setVoiceInputAvailable(!!SR)

    // Hydrate the persisted TTS toggle. Default off — auto-speaking on
    // every visit is invasive on shared devices (kiosks, public terminals).
    const savedTts = getTtsEnabled()
    setTtsEnabledState(savedTts)
    ttsEnabledRef.current = savedTts
    // Show the welcome banner once per version — client-side only, so it never
    // causes a hydration mismatch.
    if (!getWelcomeSeen(APP_VERSION)) setShowWelcome(true)
    // Kiosk: skip history hydration when chat persistence is off. Any
    // pre-existing localStorage entries stay untouched (a misconfiguration
    // revert shouldn't lose data) but they're not shown either.
    if (true) {
      const loaded = loadConversations()
      setConversations(loaded)
      // One-time seed of the tone library from tones already in existing chats,
      // so tones created before the library shipped still appear. Guarded so it
      // runs ONCE per browser — otherwise it would resurrect any library tone the
      // user deleted whose source chat still exists. New tones save on generation.
      if (!tonesBackfilled()) {
        const known = new Set(loadTones().map(t => t.id))
        for (const c of loaded) {
          let lastUser: string | undefined
          for (const m of c.messages) {
            if (m.role === 'user') lastUser = m.content
            if (m.role === 'assistant' && m.tonePatch && !known.has(m.id)) {
              addTone({
                id: m.id,
                name: m.tonePatch.patch.name,
                createdAt: c.updatedAt,
                updatedAt: c.updatedAt,
                conversationId: c.id,
                prompt: lastUser,
                tone: m.tonePatch,
              })
              known.add(m.id)
            }
          }
        }
        markTonesBackfilled()
      }
      setTones(loadTones())
      // Hydrate the active conversation from the URL (e.g. /c/<id> hard load).
      // If the id doesn't exist anymore (deleted on another tab, stale link),
      // silently fall back to / so the user sees the empty state.
      if (initialConvId) {
        const conv = loaded.find(c => c.id === initialConvId)
        if (conv) {
          setActiveId(conv.id)
          setMessages(conv.messages)
        } else if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', '/')
        }
      }
      // open sidebar by default on wide screens
      if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
        setSidebarOpen(true)
      }
    } else if (initialConvId && typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/')
    }
    // Generation prefs from localStorage.
    setCustomSystemPromptState(getCustomSystemPrompt())
    setCustomTemperatureState(getTemperature())
    // Back/forward navigation handler — when the URL changes via the
    // browser's history (popstate), reload the matching conversation
    // without remounting Home. Skip entirely when persistence is off —
    // we never push /c/<id> URLs in kiosk mode, so there's nothing to
    // restore from history, and we shouldn't surface stored data anyway.
    if (true) {
      const onPop = () => {
        const path = window.location.pathname
        const m = path.match(/^\/c\/([^/]+)\/?$/)
        if (m) {
          const id = m[1]
          const conv = loadConversations().find(c => c.id === id)
          if (conv) {
            setActiveId(id)
            setMessages(conv.messages)
            return
          }
        }
        // Not on a conv route — reset to empty.
        setActiveId(null)
        setMessages([])
      }
      window.addEventListener('popstate', onPop)
    }
    // No cleanup needed — initialized.current guard prevents re-binding.
    // Auth, then load providers. The provider list endpoint requires auth,
    // so we sequence rather than parallel.
    void (async () => {
      try {
        await initAuth()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Auth failed')
        return
      }
      try {
        const { providers: list, features } = await getProviders()
        setProviders(list)
        setFreeTierAvailable(features.freeTier !== false)
        // Resolve initial provider: stored choice (if still valid + available)
        // → first available → first in list. Then resolve model the same way.
        const stored = getSelectedProvider()
        const storedIsValid = stored && list.some(p => p.id === stored && p.available)
        const firstAvailable = list.find(p => p.available)
        const chosen = storedIsValid ? stored! : (firstAvailable?.id ?? list[0]?.id ?? 'anthropic')
        setProviderState(chosen)
        const chosenInfo = list.find(p => p.id === chosen)
        // Drop a stale model pin before reading it, so a registry default change
        // reaches existing users instead of only new ones (see migrateModelPrefs).
        migrateModelPrefs()
        const storedModel = getSelectedModel(chosen)
        const storedModelValid = storedModel && chosenInfo?.models.some(m => m.id === storedModel)
        setModelState(storedModelValid ? storedModel! : (chosenInfo?.defaultModel ?? DEFAULT_MODEL_ID))
      } catch (e) {
        console.error('providers fetch failed:', e)
      }
    })()
  }, [])

  // Choose the voice TTS speaks with, preferring en-US. Never fall back to the
  // engine default: a device can expose 90+ voices while its *default* is a
  // locale with no data installed, and speaking through that default fails with
  // `synthesis-failed` for every utterance, however short.
  //
  // Returns null when no English voice exists *yet* — Chrome populates
  // getVoices() lazily, so the first call routinely returns [] and only the
  // call itself kicks off the load. Hence both the mount call and the
  // `voiceschanged` listener, and the re-resolve at speak time.
  const resolveVoice = useCallback((): SpeechSynthesisVoice | null => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!synth) return null
    // Some engines report `en_US` where the spec says `en-US`. Normalise.
    const english = synth.getVoices()
      .filter(v => v.lang.replace(/_/g, '-').toLowerCase().startsWith('en'))
    const picked =
      english.find(v => /^en[-_]us$/i.test(v.lang)) ??
      english.find(v => /^en[-_]gb$/i.test(v.lang)) ??
      english[0] ??
      null
    if (picked) voiceRef.current = picked
    return picked
  }, [])

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!synth) return
    const onVoices = () => setVoiceOutputAvailable(!!resolveVoice())
    onVoices()
    synth.addEventListener('voiceschanged', onVoices)
    return () => synth.removeEventListener('voiceschanged', onVoices)
  }, [resolveVoice])


  // Toggle TTS. Persists to localStorage so the setting follows the user
  // across sessions. Cancels any in-flight speech when turning off so the
  // current utterance doesn't keep playing.
  const handleTtsToggle = useCallback(() => {
    setTtsEnabledState(prev => {
      const next = !prev
      ttsEnabledRef.current = next
      setTtsEnabled(next)
      if (!next && typeof window !== 'undefined') window.speechSynthesis?.cancel()
      return next
    })
  }, [])

  // Speak a string via the Web Speech API. Strips common markdown so the
  // synthesizer doesn't read out asterisks / hashes / pipe characters.
  // Caller is expected to gate on ttsEnabledRef before invoking.
  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const plain = text
      .replace(/```[\s\S]*?```/g, ' (code block) ')   // skip code blocks entirely
      .replace(/`([^`]+)`/g, '$1')                     // inline code
      .replace(/#{1,6}\s+/g, '')                       // heading markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')               // bold
      .replace(/\*([^*]+)\*/g, '$1')                   // italic
      .replace(/_([^_]+)_/g, '$1')                     // underscore italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')         // [text](url) → text
      .replace(/^\s*[-*+]\s+/gm, '')                   // bullet markers
      .replace(/^\s*>\s?/gm, '')                       // blockquote markers
      .replace(/\|/g, ' ')                             // table pipes
      .replace(/\n{2,}/g, '. ')                        // paragraph breaks → pause
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!plain) return
    // Re-resolve if the list wasn't ready at mount (cold load, fast first reply).
    const voice = voiceRef.current ?? resolveVoice()
    if (!voice) {
      setError('Voice output needs an English voice. Install one under Settings → Text-to-speech.')
      return
    }
    // Speaking is a side effect of a chat turn, never a precondition of one.
    // Anything thrown here (a rejected `voice` assignment, an engine that
    // blows up on speak()) must not escape into the caller, which goes on to
    // persist the conversation.
    try {
      const utter = new SpeechSynthesisUtterance(plain)
      // Name the voice explicitly. Leaving this unset speaks with the engine
      // default, which on Android is whatever locale the device picked (an
      // Assamese default with no data installed is what broke this) and fails
      // for every utterance. Setting only `lang` is not enough either — engines
      // that report `en_US` never match a bare `en`.
      utter.voice = voice
      utter.lang = voice.lang.replace(/_/g, '-')
      // A failed utterance is otherwise completely silent: no sound, no error.
      // `interrupted` and `canceled` are our own cancel() calls, not faults.
      utter.onerror = e => {
        if (e.error === 'interrupted' || e.error === 'canceled') return
        setTtsEnabledState(false)
        ttsEnabledRef.current = false
        setTtsEnabled(false)
        setError(
          e.error === 'not-allowed'
            ? 'Voice output was blocked by the browser. Tap the speaker button again to enable it.'
            : `Voice output failed (${e.error}). This browser may have no speech voices installed.`,
        )
      }
      window.speechSynthesis.speak(utter)
    } catch (err) {
      console.warn('[tts] speak failed:', err)
    }
  }, [resolveVoice])

  // Voice input — toggle SpeechRecognition. On stop (silence or manual),
  // auto-sends the accumulated transcript so voice queries flow end-to-end
  // without a tap-to-send step. Browsers prompt for mic permission on
  // first invocation. Locale picked from navigator.language so non-English
  // users get the right recognizer model by default.
  const toggleListening = useCallback(() => {
    if (typeof window === 'undefined') return
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    window.speechSynthesis?.cancel()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = new SR()
    r.continuous = false
    r.interimResults = true
    // Prefer the active UI locale so Spanish kiosks get the Spanish
    // recognizer, etc. Falls back to browser locale, then English.
    r.lang = locale || navigator.language || 'en-US'
    r.onstart = () => setIsListening(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((res: any) => res[0].transcript).join('')
      finalTranscriptRef.current = t
      setInput(t)
    }
    r.onend = () => {
      setIsListening(false)
      const text = finalTranscriptRef.current.trim()
      finalTranscriptRef.current = ''
      // Defer to next tick so React flushes the setInput first, otherwise
      // sendRef.current's closure may read empty input from this render.
      if (text) setTimeout(() => { sendRef.current?.() }, 50)
    }
    r.onerror = () => setIsListening(false)
    recognitionRef.current = r
    r.start()
  }, [isListening, locale])

  const handleSystemPrompt = useCallback((s: string | null) => {
    setCustomSystemPromptState(s)
    setCustomSystemPrompt(s)
  }, [])
  const handleTemperature = useCallback((t: number | null) => {
    setCustomTemperatureState(t)
    setTemperature(t)
  }, [])

  // ── auto-scroll on new content ──
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  // ── auto-resize textarea ──
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  // ── starter prompt sample ──
  // Client-only: sampling on the server would render one set of chips into the
  // HTML and a different set on hydration. Re-rolls per empty conversation, so
  // "New chat" deals a fresh five rather than the same five all session.
  const chatIsEmpty = messages.length === 0
  useEffect(() => {
    if (chatIsEmpty) setSuggestions(sampleTonePrompts(5))
  }, [chatIsEmpty, activeId, starterRoll])

  // An operator who set starterPrompts in toneai.config.json meant them; the
  // random pool is the fallback, not an override.
  const starterChips = starterPrompts.length > 0 ? starterPrompts : suggestions

  // ── handlers ──
  const handleTheme = useCallback((t: Theme) => {
    setTheme(t)
    saveTheme(t)
    document.documentElement.setAttribute('data-theme', t)
  }, [])

  const handleDevice = useCallback((d: KatanaDevice) => {
    setDevice(d)
    saveDefaultDevice(d)
  }, [])

  const handleApiKey = useCallback((k: string | null) => {
    setApiKey(k)
    saveApiKey(k)
  }, [])

  const handleGear = useCallback((next: GearState) => {
    setGear(next)
    saveGear(next)
  }, [])

  // A position selected on one guitar is meaningless on another — "middle" does
  // not exist on a Les Paul. Whenever the active instrument changes (or its
  // pickups are edited such that the choice no longer exists), fall back to
  // Auto rather than silently sending a position the instrument doesn't have.
  useEffect(() => {
    const rig = activeInstrument(gear)
    if (!rig) { setPosition('auto'); return }
    setPosition(prev => (prev === 'auto' || positionsFor(rig).includes(prev) ? prev : 'auto'))
  }, [gear])

  const handleProvider = useCallback((p: string) => {
    setProviderState(p)
    setSelectedProvider(p)
    // Restore the user's last-used model for the new provider, else its default.
    const info = providers.find(x => x.id === p)
    if (!info) return
    const stored = getSelectedModel(p)
    const storedValid = stored && info.models.some(m => m.id === stored)
    setModelState(storedValid ? stored! : info.defaultModel)
  }, [providers])

  const handleModel = useCallback((m: string) => {
    setModelState(m)
    setSelectedModel(provider, m)
  }, [provider])

  // URL sync helper. Soft-update only (history.replaceState) — we never
  // re-mount Home for in-app navigation, only on hard refresh / shared
  // link / browser back-forward. Keeps drafts, sidebar state, etc intact.
  const updateUrl = useCallback((convId: string | null) => {
    if (typeof window === 'undefined') return
    const target = convId ? `/c/${convId}` : '/'
    if (window.location.pathname === target) return
    window.history.replaceState(null, '', target)
  }, [])

  const newConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setError(null)
    setInput('')
    setStarterRoll(n => n + 1)
    updateUrl(null)
  }, [updateUrl])

  const loadConversation = useCallback((id: string) => {
    const conv = conversations.find(c => c.id === id)
    if (!conv) return
    setActiveId(id)
    setMessages(conv.messages)
    setError(null)
    updateUrl(id)
  }, [conversations, updateUrl])

  const removeConversation = useCallback((id: string) => {
    deleteConversation(id)
    setConversations(loadConversations())
    if (activeId === id) {
      setActiveId(null)
      setMessages([])
      updateUrl(null)
    }
  }, [activeId, updateUrl])

  const handleRename = useCallback((id: string, title: string) => {
    renameConversation(id, title)
    setConversations(loadConversations())
  }, [])

  // ── tone library handlers ──
  const removeTone = useCallback((id: string) => {
    deleteTone(id)
    setTones(loadTones())
  }, [])

  const handleRenameTone = useCallback((id: string, name: string) => {
    renameTone(id, name)
    setTones(loadTones())
  }, [])

  const clearAllTonesHandler = useCallback(() => {
    clearAllTones()
    setTones([])
  }, [])

  // Stable identity for a tone as a conversion SOURCE. Keyed on device + name so
  // a converted copy can be found again (and re-converting the same source to the
  // same device maps to ONE library entry, never a pile of duplicates).
  const toneSig = (t: TonePatchResult) => `${t.device}|${t.patch.name}`

  // The already-made conversion of `src` for `device`, if one exists. Lets the
  // card offer "open the version you made" instead of prompting to convert again.
  // Matches on the source signature; falls back to source label + patch name so
  // conversions made before signatures existed are still recognized.
  const findConvertedVersion = useCallback(
    (src: TonePatchResult, device: KatanaDevice): TonePatchResult | undefined => {
      const sig = toneSig(src)
      return tones.find(t => {
        const cf = t.tone.convertedFrom
        if (t.tone.device !== device || !cf) return false
        return cf.sourceSig
          ? cf.sourceSig === sig
          : cf.deviceLabel === src.deviceLabel && t.tone.patch.name === src.patch.name
      })?.tone
    },
    [tones],
  )

  // Convert a tone to another device: re-voice the intent, render the target
  // .tsl, save it as a library tone (standing on its own, not tied to a chat),
  // and re-open the modal on it. The original is untouched. The id is derived
  // from source+target so converting the same tone twice REPLACES rather than
  // duplicates (addTone upserts by id).
  const handleConvertTone = useCallback((src: TonePatchResult, toDevice: KatanaDevice, toLabel: string) => {
    const sig = toneSig(src)
    const id = `conv:${sig}->${toDevice}`
    const { patch, notes, tsl, filename } = convertTone(src.patch, src.device as KatanaDevice, toDevice)
    const now = Date.now()
    const result: TonePatchResult = {
      ...src,
      patch,
      device: toDevice,
      deviceLabel: toLabel,
      tsl,
      filename,
      experimental: false, // canConvert only permits verified target writers
      convertedFrom: { deviceLabel: src.deviceLabel, notes, sourceSig: sig },
    }
    addTone({ id, name: patch.name, createdAt: now, updatedAt: now, conversationId: null, tone: result })
    setTones(loadTones())
    setOpenTone({ tone: result, conversationId: null })
  }, [])

  // Open a saved tone's source conversation (from the tone detail modal).
  // No-op if that chat was since deleted — the tone still stands on its own.
  const goToChatFromTone = useCallback((conversationId: string | null) => {
    setOpenTone(null)
    setSidebarOpen(false)
    if (conversationId) loadConversation(conversationId)
  }, [loadConversation])

  // Build the wire-format messages array (multimodal content where needed)
  // from the in-memory ChatMessage[]. Shared by send/edit/regenerate.
  const buildWireMessages = useCallback((msgs: ChatMessage[]): MultimodalMessage[] =>
    msgs.map(m => {
      if (m.attachments && m.attachments.length > 0) {
        // Document attachments inject their extracted text as a prefix into
        // the user's prompt — every provider can read it as plain text, no
        // multimodal capability required. Images go in as image_url blocks
        // (multimodal-capable providers only; token.js routes the format).
        const docPrefixes: string[] = []
        const imageBlocks: ContentBlock[] = []
        for (const att of m.attachments) {
          if (att.kind === 'document' && att.extractedText) {
            docPrefixes.push(`[Attached document: ${att.name}]\n${att.extractedText}`)
          } else if (att.kind === 'image' && att.dataUrl) {
            imageBlocks.push({ type: 'image_url', image_url: { url: att.dataUrl } })
          }
        }
        const combinedText = [...docPrefixes, m.content].filter(Boolean).join('\n\n---\n\n')
        // If we only have text (docs + typed prompt, no images), keep
        // content as a plain string so non-multimodal providers (e.g.
        // perplexity, ai21) don't choke on the content array.
        if (imageBlocks.length === 0) return { role: m.role, content: combinedText }
        const blocks: ContentBlock[] = []
        if (combinedText) blocks.push({ type: 'text', text: combinedText })
        blocks.push(...imageBlocks)
        return { role: m.role, content: blocks }
      }
      return { role: m.role, content: m.content }
    }),
  [])

  const clearAll = useCallback(() => {
    clearAllConversations()
    setConversations([])
    setActiveId(null)
    setMessages([])
    updateUrl(null)
  }, [updateUrl])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
  }, [])

  // ── attachment handlers ──
  // The only files this app ingests are KATANA patches:
  //   .tsl  BOSS Tone Studio liveset — JSON, readable as text
  //   .kat  single patch — flat binary, one layout per amp generation
  const PATCH_EXT = /\.(kat|tsl)$/i

  const onPickPatch = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting the same file later
    if (!f) return

    // `accept` on the input is advisory. Enforce the real constraint here.
    if (!PATCH_EXT.test(f.name)) {
      setError(`"${f.name}" isn't a patch file. Only .kat and .tsl are accepted.`)
      return
    }
    // Cap to ~5MB per file to keep base64 payloads sane. A real liveset is
    // ~30 KB, so anything near this ceiling is not a patch.
    if (f.size > 5 * 1024 * 1024) {
      setError(`Attachment "${f.name}" is too large (max 5 MB).`)
      return
    }

    const mimeType = f.type || 'application/octet-stream'
    const placeholder: Attachment = {
      kind: 'document', name: f.name, mimeType, size: f.size, extracting: true,
    }
    setPendingAttachments(prev => [...prev, placeholder])
    const idxKey = f.name + ':' + f.size  // unique-ish key to find it later

    const patch = (updates: Partial<Attachment>) => {
      setPendingAttachments(prev => prev.map(a =>
        (a.name + ':' + a.size === idxKey && a.extracting) ? { ...a, ...updates, extracting: false } : a
      ))
    }

    try {
      if (!/\.tsl$/i.test(f.name)) {
        // .kat is a flat binary whose layout differs per amp generation, and
        // this repo has no decoder for it yet (docs/kat-format.md is research,
        // not an implementation). Reading it as text would hand the model
        // mojibake that looks like data. Refuse rather than corrupt.
        throw new Error('.kat import is not implemented yet — export a .tsl liveset from BOSS Tone Studio instead')
      }
      const text = await f.text()
      // Fail here rather than let the model reason over a truncated or
      // non-liveset JSON file that merely happens to end in .tsl.
      JSON.parse(text)
      patch({ extractedText: text })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read patch'
      patch({ extractError: msg })
      setError(`Couldn't read "${f.name}": ${msg}`)
    }
  }, [])

  const removePendingAttachment = useCallback((idx: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // Core chat-run flow. Takes a fully-prepared messages array (ending with a
  // user turn). Pushes an empty assistant placeholder, streams the response
  // into it, persists. Shared by send, editAndResend, regenerate.
  const runFlowWith = useCallback(async (newMessages: ChatMessage[]) => {
    // Device × instrument pre-gate (mirrors the server 400) — catch it here so we
    // never spend an API call on a blocked combination. Applies to send, edit,
    // and regenerate (all route through here).
    const played = activeInstrument(gear)?.kind
    const issue = deviceInstrumentIssue(device, played)
    if (issue) {
      setError(deviceInstrumentIssueMessage(issue))
      return
    }

    setMessages(newMessages)
    setError(null)
    setStreaming(true)

    const abort = new AbortController()
    abortRef.current = abort

    const assistantId = uuidv4()
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMsg])

    const wireMessages = buildWireMessages(newMessages)

    // Count the request against the pill the moment it's submitted, not when
    // the stream finishes. Only free-mode requests consume the shared pool.
    const spendsQuota = !apiKey
    if (spendsQuota) setOptimisticSpend(n => n + 1)

    let capturedTone: import('@/lib/types').TonePatchResult | undefined
    try {
      const res = await sendChatStream(
        wireMessages,
        delta => {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m
          ))
        },
        abort.signal,
        {
          provider, model, webSearch: true, apiKey,
          systemPrompt: customSystemPrompt ?? undefined,
          temperature: customTemperature ?? undefined,
          device,
          instrument: played,
          rig: (() => {
            const inst = activeInstrument(gear)
            return inst ? describeRig(inst, position === 'auto' ? undefined : position) : undefined
          })(),
        },
        {
          onToolRunning: info => setToolRunning(info),
          onSources: sources => {
            setToolRunning(null)
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, sources: [...(m.sources ?? []), ...sources] }
                : m
            ))
          },
          onTonePatch: tone => {
            capturedTone = tone
            setToolRunning(null)
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, tonePatch: tone } : m
            ))
          },
        },
      )
      const finalAssistant: ChatMessage = {
        id: assistantId, role: 'assistant', content: res.message, sources: res.sources,
        tonePatch: capturedTone,
      }
      // Speak the assistant's reply once the stream completes. Gated on
      // ttsEnabledRef (not state) so this picks up the current toggle
      // value rather than a stale snapshot from when send() was created.
      if (ttsEnabledRef.current) speakText(res.message)
      const finalMessages = [...newMessages, finalAssistant]
      setMessages(finalMessages)

      // Kiosk: skip every persistence step when chat history is disabled.
      // In-memory `messages` state already shows the user the conversation;
      // we just don't write anything to localStorage or the URL.
      if (true) {
        const convId = activeId ?? uuidv4()
        const now = Date.now()
        const existing = conversations.find(c => c.id === convId)
        const conv: Conversation = {
          id: convId,
          title: existing?.title ?? autoTitle(finalMessages),
          messages: finalMessages,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        upsertConversation(conv)
        setConversations(loadConversations())

        // Save the generated tone to the library, keyed to this conversation
        // so "Go to chat" can navigate back. Independent store — survives chat
        // deletion. Uses the assistant message id so a regenerate replaces
        // rather than duplicates.
        if (capturedTone) {
          const lastUser = [...finalMessages].reverse().find(m => m.role === 'user')
          const now2 = Date.now()
          addTone({
            id: assistantId,
            name: capturedTone.patch.name,
            createdAt: now2,
            updatedAt: now2,
            conversationId: convId,
            prompt: lastUser?.content,
            tone: capturedTone,
          })
          setTones(loadTones())
        }

        if (!activeId) {
          setActiveId(convId)
          updateUrl(convId)
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== assistantId || m.content.length > 0))
      } else {
        const msg = e instanceof Error ? e.message : 'Request failed'
        setError(msg)
        setMessages(prev => prev.filter(m => m.id !== assistantId || m.content.length > 0))
      }
    } finally {
      setStreaming(false)
      setToolRunning(null)
      abortRef.current = null
      // Reconcile the pill against the server. Runs on success, error, and
      // abort alike: a 429 or a cancelled stream must not leave the optimistic
      // decrement stranded. Clearing the local count and re-fetching in the
      // same tick means the authoritative number replaces the guess.
      if (spendsQuota) {
        setOptimisticSpend(n => Math.max(0, n - 1))
        setQuotaVersion(v => v + 1)
      }
    }
  }, [activeId, conversations, provider, model, apiKey, customSystemPrompt, customTemperature, device, gear, position, buildWireMessages, updateUrl])

  // One-click starter prompts: skip the input field entirely, fire the
  // prompt as a user message immediately. Mirrors the empty-state chip
  // UX in ChatGPT / Vercel chatbot.
  const sendStarterPrompt = useCallback(async (text: string) => {
    if (streaming || !text.trim()) return
    const userMsg: ChatMessage = { id: uuidv4(), role: 'user', content: text }
    await runFlowWith([...messages, userMsg])
  }, [streaming, messages, runFlowWith])

  const send = useCallback(async () => {
    // Silence any TTS still playing from the previous turn so the user's
    // new message doesn't talk over the assistant's old reply.
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    const text = input.trim()
    if ((!text && pendingAttachments.length === 0) || streaming) return

    // Don't send while any document is still being extracted, or if any
    // failed extraction.
    const stillExtracting = pendingAttachments.some(a => a.extracting)
    if (stillExtracting) {
      setError("Wait — still extracting one or more attached documents.")
      return
    }
    const failed = pendingAttachments.find(a => a.extractError)
    if (failed) {
      setError(`Can't send: extraction failed for "${failed.name}". Remove it to continue.`)
      return
    }

    const attachments = pendingAttachments.slice()
    const userMsg: ChatMessage = {
      id: uuidv4(), role: 'user', content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
    }
    setInput('')
    setPendingAttachments([])
    await runFlowWith([...messages, userMsg])
  }, [input, streaming, messages, pendingAttachments, runFlowWith])

  // Refresh sendRef every render so voice-input's onend handler always
  // invokes the latest send() (closing over the current `input` state).
  // Cheap: just stamps a ref, no re-render trigger.
  sendRef.current = send

  // Edit-and-resend: replace the chosen user message's content, drop every
  // message after it (the now-stale assistant response and any downstream
  // turns), and re-run the chat. Mirrors Claude.ai / ChatGPT semantics.
  const editAndResend = useCallback(async (msgId: string, newContent: string) => {
    if (streaming) return
    const idx = messages.findIndex(m => m.id === msgId)
    if (idx < 0 || messages[idx].role !== 'user') return
    const editedMsg: ChatMessage = { ...messages[idx], id: uuidv4(), content: newContent }
    await runFlowWith([...messages.slice(0, idx), editedMsg])
  }, [messages, streaming, runFlowWith])

  // Regenerate: drop the last (assistant) message and re-run with the same
  // user prompt that produced it.
  const regenerate = useCallback(async () => {
    if (streaming || messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return
    await runFlowWith(messages.slice(0, -1))
  }, [messages, streaming, runFlowWith])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    send()
  }

  // ── render ──
  return (
    <div className="flex h-full bg-bg text-fg">
      {(
        <Sidebar
          visible={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          conversations={conversations}
          activeId={activeId}
          query={search}
          setQuery={setSearch}
          onSelectConv={loadConversation}
          onDeleteConv={(id, title) => setConfirmDelete({ label: `"${title}"`, doDelete: () => removeConversation(id) })}
          onRenameConv={handleRename}
          onClearAll={() => setConfirmDelete({
            label: `all ${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`,
            doDelete: clearAll,
          })}
          tab={sidebarTab}
          onTab={setSidebarTab}
          tones={tones}
          onOpenTone={tn => { setOpenTone({ tone: tn.tone, conversationId: tn.conversationId }); setSidebarOpen(false) }}
          onDeleteTone={(id, name) => setConfirmDelete({ label: `the tone "${name}"`, doDelete: () => removeTone(id) })}
          onRenameTone={handleRenameTone}
          onClearAllTones={() => setConfirmDelete({
            label: `all ${tones.length} saved tone${tones.length === 1 ? '' : 's'}`,
            doDelete: clearAllTonesHandler,
          })}
          appName={appName}
          showClearAll={true}
        />
      )}

      {/* main column */}
      <div className="flex-1 flex flex-col min-w-0 bg-bg">
        {(
        <header className="toneai-header px-3 py-3 flex items-center gap-1 shrink-0 z-10">
          {(
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg transition-colors lg:hidden"
              title={t('header.openChats', 'Open chats')}
              aria-label={t('header.openChats', 'Open chats')}
            >
              <MenuIcon />
            </button>
          )}
          {(
            // Hidden at lg+, where the sidebar is persistent (lg:relative) and
            // already shows the app name — the header copy would be a duplicate.
            <h1 className="text-sm font-medium text-fg lg:hidden">{appName}</h1>
          )}
          <div className="flex-1" />
          {/* Free-tier counter. Hidden entirely in BYOK mode — a countdown
              would imply a limit that doesn't apply to the user's own key. */}
          {!apiKey && freeTierAvailable && <QuotaPill version={quotaVersion} optimistic={optimisticSpend} />}
          {/* New chat + Settings — promoted out of the kebab to bare icons.
              These are the two items reached often enough to warrant a direct
              tap (the device pill in the composer also opens Settings). */}
          <button
            onClick={() => newConversation()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg transition-colors"
            title={t('header.newChat', 'New chat')}
            aria-label={t('header.newChat', 'New chat')}
          >
            <NewChatIcon />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg transition-colors"
            title={t('header.settings', 'Settings')}
            aria-label={t('header.settings', 'Settings')}
          >
            <GearIcon />
          </button>
          {/* Kebab menu — reload, new chat, download, delete. Reload is
              unconditional so the menu is always rendered; the other items
              are state-gated. */}
          <div className="relative">
              <button
                onClick={() => setHeaderMenuOpen(v => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg transition-colors"
                title={t('header.more', 'More')}
                aria-label={t('header.more', 'More actions')}
                aria-haspopup="menu"
                aria-expanded={headerMenuOpen}
              >
                <EllipsisIcon />
              </button>
              {headerMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setHeaderMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 min-w-[12rem] rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden animate-dropdown origin-top">
                    <button
                      onClick={() => { setHeaderMenuOpen(false); window.location.reload() }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg hover:bg-surface-3 transition-colors"
                    >
                      <RefreshIcon />
                      <span>{t('header.refresh', 'Reload')}</span>
                    </button>
                    {messages.length > 0 && (
                      <button
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          const conv: Conversation = activeId
                            ? (conversations.find(c => c.id === activeId)
                                ?? { id: activeId, title: 'Chat', messages, createdAt: Date.now(), updatedAt: Date.now() })
                            : { id: 'unsaved', title: autoTitle(messages), messages, createdAt: Date.now(), updatedAt: Date.now() }
                          const safeTitle = conv.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'toneai-chat'
                          downloadTextFile(conversationToMarkdown(conv), `${safeTitle}.md`, 'text/markdown')
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg hover:bg-surface-3 transition-colors"
                      >
                        <DownloadIcon />
                        <span>{t('header.downloadChat', 'Download chat')}</span>
                      </button>
                    )}
                    {activeId && (
                      <button
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          const conv = conversations.find(c => c.id === activeId)
                          if (!conv) return
                          setConfirmDelete({
                            label: `"${conv.title}"`,
                            doDelete: () => { removeConversation(activeId); newConversation() },
                          })
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg hover:bg-surface-3 hover:text-red-400 transition-colors"
                      >
                        <TrashIcon />
                        <span>{t('header.deleteChat', 'Delete chat')}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
        </header>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {messages.length === 0 && (
              <>
                {welcomeMessage
                  ? (
                    <div className="group flex flex-col items-start gap-0.5">
                      <div className="flex items-end gap-1.5 max-w-full">
                        <div className="toneai-assistant-bubble min-w-0 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-fg">
                          <div className="prose prose-sm max-w-none [&>*]:my-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-surface-2 [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock, table: TableBlock }}>{welcomeMessage}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                  : starterChips.length === 0 && (
                    <div className="text-center py-16 text-fg-4 text-sm">
                      Start a conversation.
                    </div>
                  )
                }
                {starterChips.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {starterChips.map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => sendStarterPrompt(prompt)}
                        disabled={streaming}
                        className="rounded-full border border-primary/30 bg-surface px-3.5 py-1.5 text-xs text-fg-2 hover:border-primary hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {messages.map(m => (
              <MessageItem
                key={m.id}
                msg={m}
                streaming={streaming}
                isLastAssistant={m.role === 'assistant' && m.id === messages[messages.length - 1]?.id}
                onEditAndResend={editAndResend}
                onRegenerate={regenerate}
                showActions={true}
                showSources={true}
                onOpenTone={tone => setOpenTone({ tone, conversationId: activeId })}
              />
            ))}
          </div>
        </div>

        {/* error banner */}
        {error && (
          <div className="relative mx-4 mb-2 rounded-xl border px-4 py-2.5 pr-8" style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)' }}>
            <button onClick={() => setError(null)} className="absolute top-2.5 right-2.5 hover:opacity-100" style={{ color: 'var(--error-fg)' }} aria-label="Dismiss error"><CloseIcon /></button>
            <span className="text-sm" style={{ color: 'var(--error-fg)' }}>{error}</span>
          </div>
        )}

        {/* tool-running banner — shown while the model is calling a tool mid-stream */}
        {toolRunning && (
          <div className="mx-4 mb-2 rounded-xl border border-white/10 bg-surface px-3 py-2 flex items-center gap-2 text-xs text-fg-2 animate-fade-in">
            <span className="text-primary"><GlobeIcon /></span>
            <span>Searching{toolRunning.query ? `: ${toolRunning.query}` : '…'}</span>
            <span className="text-fg-4 animate-pulse">·</span>
          </div>
        )}

        {/* composer */}
        <div className="toneai-composer px-4 pb-4 pt-2 shrink-0">
          {/* hidden file inputs */}
          {/* `accept` is a picker hint only — a user can still choose "all files"
              or drop something else, so onPickPatch re-checks the extension. */}
          <input ref={patchInputRef} type="file" accept=".kat,.tsl" className="hidden" onChange={onPickPatch} />

          <div className="toneai-composer-pill max-w-3xl mx-auto rounded-3xl border border-white/10 transition-colors focus-within:border-primary/40">
            {/* pending attachment chips (above the textarea) */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {pendingAttachments.map((att, idx) => (
                  <div
                    key={idx}
                    className={`group flex items-center gap-2 rounded-lg border px-2 py-1 text-xs ${
                      att.extractError ? 'border-red-400/40 bg-red-500/10 text-red-300' : 'border-white/10 bg-surface-2 text-fg-2'
                    }`}
                  >
                    {att.kind === 'image' && att.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={att.dataUrl} alt={att.name} className="h-6 w-6 rounded object-cover" />
                    ) : (
                      <span className="text-fg-4"><DocumentIcon /></span>
                    )}
                    <span className="truncate max-w-[10rem]" title={att.extractError ?? att.name}>{att.name}</span>
                    {att.extracting && <span className="text-[10px] text-fg-4 animate-pulse">extracting…</span>}
                    {att.extractedText && att.kind === 'document' && (
                      <span className="text-[10px] text-fg-4">{Math.round(att.extractedText.length / 1024)}k chars</span>
                    )}
                    {att.extractError && <span className="text-[10px]">failed</span>}
                    <button
                      onClick={() => removePendingAttachment(idx)}
                      title="Remove"
                      className="text-fg-4 hover:text-red-400 transition-colors"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Device pill — the amp the generated patch targets. Replaces the
             *  provider + model pills: this app is Anthropic-only, so provider
             *  and model are server-side decisions, not user-facing ones. The
             *  target amp is the one choice that changes what gets written, so
             *  it earns the composer's only pill. Clicking opens Settings,
             *  where the full grouped picker lives — no second dropdown to
             *  keep in sync. */}
            {(() => {
              const activeDevice = KATANA_DEVICES.find(d => d.id === device) ?? KATANA_DEVICES[0]
              const rig = activeInstrument(gear)
              // flex-wrap: three pills overflow a phone-width composer. Wrapping
              // beats clipping — every pill stays reachable. Each is min-w-0 so
              // its label truncates instead of shoving siblings off-screen.
              return (
                <div className="px-2.5 pt-2.5 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"
                    title={`Target amp: ${activeDevice.label} — change in settings`}
                  >
                    <AmpIcon />
                    <span className="truncate max-w-[9rem]">{activeDevice.label}</span>
                  </button>
                  {/* Gear pill. Shows the active instrument, or invites adding one.
                   *  Same destination as the amp pill — Settings owns both pickers,
                   *  so there's no second dropdown to keep in sync. */}
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      rig
                        ? 'border-white/10 bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg'
                        : 'border-dashed border-white/15 bg-transparent text-fg-4 hover:text-fg-2'
                    }`}
                    title={rig
                      ? `${rig.name} — ${describeRig(rig, positionsFor(rig).at(-1))} — change in settings`
                      : 'No instrument set — add one in settings'}
                  >
                    <GuitarIcon />
                    <span className="truncate max-w-[8rem]">{rig ? rig.name : 'Add gear'}</span>
                  </button>

                  {/* Pickup position — per-request, never stored on the instrument.
                   *  Defaults to Auto: the model picks from the positions this
                   *  guitar actually has, because the position is a property of
                   *  the tone, not of the guitar. Only shown when there is a
                   *  choice to make (2+ pickups fitted). */}
                  {rig && positionsFor(rig).length > 1 && (
                    <label className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-surface-2 px-2 py-1.5 text-xs text-fg-2 hover:bg-surface-3 transition-colors">
                      <span className="sr-only">Pickup position</span>
                      <select
                        value={position}
                        onChange={e => setPosition(e.target.value as PositionChoice)}
                        aria-label="Pickup position"
                        title="Pickup position — Auto lets the model choose to suit the tone"
                        className="bg-transparent text-xs text-fg-2 focus:outline-none cursor-pointer"
                      >
                        <option value="auto">Auto</option>
                        {positionsFor(rig).map(p => (
                          <option key={p} value={p}>
                            {positionLabel(p, equippedPickups(rig).length)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )
            })()}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('composer.placeholder', 'Send a message…')}
              rows={1}
              className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-fg placeholder:text-fg-4 outline-none disabled:opacity-50"
              style={{ maxHeight: '160px', overflowY: 'auto' }}
              disabled={streaming}
            />
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
              {/* attach button + model pill on the left */}
              <div className="flex items-center gap-1.5">
                {/* Attach a patch file. No source menu (camera/photos/documents):
                    the only thing this app ingests is a KATANA patch, so the
                    paperclip opens the file picker directly, filtered to the two
                    patch extensions. Hidden until all generations are supported
                    (see ATTACH_ENABLED). */}
                {ATTACH_ENABLED && (
                  <button
                    onClick={() => patchInputRef.current?.click()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg transition-colors"
                    title={t('composer.attach', 'Attach a patch (.kat or .tsl)')}
                    aria-label={t('composer.attachFile', 'Attach a patch file')}
                  >
                    <AttachIcon />
                  </button>
                )}
                {/* TTS toggle — speak assistant replies via Web Speech API
                    once the stream completes. Hidden when the browser
                    doesn't expose speechSynthesis (rare).
                    Off by default (auto-speak is invasive on shared devices);
                    preference persists via localStorage. */}
                {voiceOutputAvailable && (
                  <button
                    onClick={handleTtsToggle}
                    title={ttsEnabled
                      ? t('composer.voiceOutputOn', 'Voice output: ON — click to mute')
                      : t('composer.voiceOutputOff', 'Voice output: off — click to speak replies')}
                    aria-label={t('composer.voiceOutputOff', 'Toggle voice output')}
                    aria-pressed={ttsEnabled}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      ttsEnabled
                        ? 'text-primary bg-primary/15 hover:bg-primary/25'
                        : 'text-fg-3 hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {ttsEnabled ? <VolumeOnIcon /> : <VolumeOffIcon />}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {/* Mic — toggle SpeechRecognition. Locale auto-picked
                    from navigator.language so non-English users get the
                    right recognizer by default. Auto-sends on silence
                    (recognition.onend) — voice flow goes question →
                    transcript → send without a tap. Hidden when the
                    browser doesn't expose SpeechRecognition.
                    Disabled while streaming to avoid mid-reply input. */}
                {voiceInputAvailable && (
                  <button
                    onClick={toggleListening}
                    disabled={streaming}
                    title={isListening
                      ? t('composer.voiceInputStop', 'Stop recording')
                      : t('composer.voiceInput', 'Voice input')}
                    aria-label={t('composer.voiceInput', 'Voice input')}
                    aria-pressed={isListening}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isListening
                        ? 'text-red-400 bg-red-500/10 animate-pulse'
                        : 'text-fg-3 hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    <MicIcon />
                  </button>
                )}
                {streaming ? (
                  <button
                    onClick={stop}
                    title={t('composer.stop', 'Stop')}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-on-primary hover:opacity-90 transition-opacity"
                  >
                    <StopIcon />
                  </button>
                ) : (
                  <button
                    onClick={send}
                    disabled={!input.trim() && pendingAttachments.length === 0}
                    title={t('composer.send', 'Send')}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  >
                    <SendIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* hidden import file input — triggered by Settings "Import…" button */}
      <input
        ref={importJsonRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            const text = await f.text()
            const res = importConversationsJson(text)
            setConversations(loadConversations())
            setError(`Imported ${res.imported} conversation${res.imported === 1 ? '' : 's'} (${res.skipped} skipped as duplicates or invalid).`)
          } catch (err) {
            setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
          }
        }}
      />

      {settingsOpen && (
        <SettingsPanel
          theme={theme}
          onTheme={handleTheme}
          device={device}
          onDevice={handleDevice}
          apiKey={apiKey}
          onApiKey={handleApiKey}
          gear={gear}
          onGear={handleGear}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {confirmDelete && (
        <DeleteConfirmModal
          label={confirmDelete.label}
          onConfirm={() => { confirmDelete.doDelete(); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {openTone && (
        <ToneModal
          tone={openTone.tone}
          currentDevice={device}
          currentDeviceLabel={(KATANA_DEVICES.find(d => d.id === device) ?? KATANA_DEVICES[0]).label}
          onConvert={handleConvertTone}
          findConvertedVersion={findConvertedVersion}
          onOpenConverted={t => setOpenTone({ tone: t, conversationId: null })}
          onClose={() => setOpenTone(null)}
          onGoToChat={
            openTone.conversationId && openTone.conversationId !== activeId &&
            conversations.some(c => c.id === openTone.conversationId)
              ? () => goToChatFromTone(openTone.conversationId)
              : undefined
          }
        />
      )}
      {showWelcome && (
        <WelcomeModal onDismiss={() => { saveWelcomeSeen(APP_VERSION); setShowWelcome(false) }} />
      )}
    </div>
  )
}
