'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { v4 as uuidv4 } from 'uuid'
import { sendChatStream, initAuth, getProviders, getProviderModels, getMcpServers, extractDocument, type AvailableProvider, type ProviderModel, type AvailableMcpServer, type MultimodalMessage, type ContentBlock } from '@/lib/api'
import {
  loadConversations, upsertConversation, deleteConversation, renameConversation,
  clearAllConversations, autoTitle, relativeTime, getTheme, saveTheme, type Theme,
  getSelectedProvider, setSelectedProvider, getSelectedModel, setSelectedModel,
  getWebSearchEnabled, setWebSearchEnabled,
  getEnabledMcps, setEnabledMcps,
  getCustomSystemPrompt, setCustomSystemPrompt,
  getTemperature, setTemperature,
  exportAll, importConversationsJson, resetAllData,
  conversationToMarkdown, downloadTextFile,
  getTtsEnabled, setTtsEnabled,
} from '@/lib/storage'
import type { ChatMessage, Conversation, Attachment } from '@/lib/types'
import { useT, useLocale, useAvailableLocales, setLocaleAndReload, labelForLocale } from '@/lib/i18n/client'

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

// Branding pulled from window.__CHATFRAME (injected by app/layout.tsx from
// the runtime chatframe.config.json read). All fields fall back to "ChatFrame"
// defaults when window or the global aren't available (SSR, tests).
interface ChatframeBranding {
  name: string
  shortName: string
  welcomeMessage: string
  checkForUpdatesUrl: string
  customThemes: { id: string; name: string; category: 'dark' | 'light'; swatches?: [string, string, string]; colors?: Record<string, string> }[]
  hideBuiltIns: boolean
}
function getChatframeBranding(): ChatframeBranding {
  if (typeof window === 'undefined') {
    return { name: 'ChatFrame', shortName: 'ChatFrame', welcomeMessage: '', checkForUpdatesUrl: '#', customThemes: [], hideBuiltIns: false }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (window as any).__CHATFRAME ?? {}
  return {
    name: w.name ?? 'ChatFrame',
    shortName: w.shortName ?? 'ChatFrame',
    welcomeMessage: typeof w.welcomeMessage === 'string' ? w.welcomeMessage : '',
    checkForUpdatesUrl: w.checkForUpdatesUrl ?? '#',
    customThemes: Array.isArray(w.customThemes) ? w.customThemes : [],
    hideBuiltIns: !!w.hideBuiltInThemes,
  }
}

// Kiosk visibility flags from window.__CHATFRAME.flags. All default true (full
// UI) when the global isn't present, so non-kiosk SSR/tests behave normally.
interface ChatframeFlags {
  showHeader: boolean
  showHeaderIcon: boolean
  showHeaderTitle: boolean
  showSettings: boolean
  persistChat: boolean
  showWebSearch: boolean
  showMcp: boolean
  showModelPicker: boolean
  showAttachments: boolean
  showVoiceInput: boolean
  showVoiceOutput: boolean
  // v0.7.0 — operator-suppression flags. All default ON. Mirror of KioskFlags.
  showSystemPromptEdit: boolean
  showTemperatureEdit: boolean
  showImportExportReset: boolean
  showDownloadChat: boolean
  showClearAllConversations: boolean
  showMessageActions: boolean
  showSourcesCitations: boolean
}
function getChatframeFlags(): ChatframeFlags {
  const fallback = {
    showHeader: true, showHeaderIcon: true, showHeaderTitle: true,
    showSettings: true, persistChat: true,
    showWebSearch: true, showMcp: true, showModelPicker: true,
    showAttachments: true,
    showVoiceInput: true, showVoiceOutput: true,
    showSystemPromptEdit: true, showTemperatureEdit: true, showImportExportReset: true,
    showDownloadChat: true, showClearAllConversations: true, showMessageActions: true,
    showSourcesCitations: true,
  }
  if (typeof window === 'undefined') return fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = (window as any).__CHATFRAME?.flags
  if (!f || typeof f !== 'object') return fallback
  return {
    showHeader:      f.showHeader      !== false,
    showHeaderIcon:  f.showHeaderIcon  !== false,
    showHeaderTitle: f.showHeaderTitle !== false,
    showSettings:    f.showSettings    !== false,
    persistChat:     f.persistChat     !== false,
    showWebSearch:   f.showWebSearch   !== false,
    showMcp:         f.showMcp         !== false,
    showModelPicker: f.showModelPicker !== false,
    showAttachments: f.showAttachments !== false,
    showVoiceInput:  f.showVoiceInput  !== false,
    showVoiceOutput: f.showVoiceOutput !== false,
    showSystemPromptEdit:      f.showSystemPromptEdit      !== false,
    showTemperatureEdit:       f.showTemperatureEdit       !== false,
    showImportExportReset:     f.showImportExportReset     !== false,
    showDownloadChat:          f.showDownloadChat          !== false,
    showClearAllConversations: f.showClearAllConversations !== false,
    showMessageActions:        f.showMessageActions        !== false,
    showSourcesCitations:      f.showSourcesCitations      !== false,
  }
}

// ─── icons ───────────────────────────────────────────────────────────────────

const ChatframeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" rx="90" ry="90" fill="#0B1320"/>
    <rect x="1.5" y="1.5" width="509" height="509" rx="89" ry="89" fill="none" stroke="#3EC1D5" strokeWidth="1.5" strokeOpacity="0.22"/>
    <text x="256" y="256" textAnchor="middle" dominantBaseline="middle" fontFamily="'Noto Sans Mono', 'Courier New', monospace" fontSize="240" fontWeight="700" fill="#3EC1D5" letterSpacing="-4">{'{Cf}'}</text>
  </svg>
)
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
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
// MCP brand mark: four diamonds arranged around a center point.
const McpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="10" y="1" width="4" height="4" transform="rotate(45 12 3)"/>
    <rect x="10" y="19" width="4" height="4" transform="rotate(45 12 21)"/>
    <rect x="1" y="10" width="4" height="4" transform="rotate(45 3 12)"/>
    <rect x="19" y="10" width="4" height="4" transform="rotate(45 21 12)"/>
  </svg>
)
const AttachIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
)
const CameraSmIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
)
const PhotoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
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
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={onCancel} />
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

// ─── settings panel (right drawer) ───────────────────────────────────────────

function SettingsPanel({
  theme, onTheme,
  providers, selectedProvider, onProvider,
  customSystemPrompt, onSystemPrompt,
  customTemperature, onTemperature,
  onExport, onImport, onResetAll,
  onClose,
  flags,
}: {
  theme: Theme
  onTheme: (t: Theme) => void
  providers: AvailableProvider[]
  selectedProvider: string
  onProvider: (p: string) => void
  customSystemPrompt: string | null
  onSystemPrompt: (s: string | null) => void
  customTemperature: number | null
  onTemperature: (t: number | null) => void
  onExport: () => void
  onImport: () => void
  onResetAll: () => void
  onClose: () => void
  flags: ChatframeFlags
}) {
  const [closing, setClosing] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [providerOpen, setProviderOpen] = useState(false)
  const [localeOpen, setLocaleOpen] = useState(false)
  // Local draft state for the system prompt textarea so the user can type
  // without each keystroke writing to localStorage. Commits on blur.
  const [promptDraft, setPromptDraft] = useState(customSystemPrompt ?? '')
  const t = useT()
  const activeLocale = useLocale()
  const availableLocales = useAvailableLocales()

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 240)
  }

  // Merge built-in themes with any custom themes from chatframe.config.json
  // (read at runtime via window.__CHATFRAME). Custom themes are appended to the
  // built-in groups by category; if hideBuiltIns is true, only customs show.
  const branding = getChatframeBranding()
  // Themes are the fixed amp palette — no runtime/config-driven custom themes.
  const THEMES_LIVE: ThemeMeta[] = THEMES
  const THEME_GROUPS_LIVE: { label: string; ids: Theme[] }[] = BUILT_IN_THEME_GROUPS

  const active = THEMES_LIVE.find(t => t.id === theme) ?? THEMES_LIVE[0]
  const activeProvider = providers.find(p => p.id === selectedProvider) ?? providers[0]

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={handleClose} />
      <aside className={`fixed right-0 top-0 z-50 flex h-full w-[min(20rem,100vw)] flex-col bg-surface shadow-2xl ${closing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-medium text-fg">{t('settings.title', 'Settings')}</h2>
          <button onClick={handleClose} className="text-fg-3 hover:text-fg transition-colors" aria-label={t('settings.close', 'Close settings')}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
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
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto">
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
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto">
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

          {/* Provider */}
          {providers.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-2">Provider</p>
              <div className="relative">
                <button
                  onClick={() => setProviderOpen(o => !o)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors"
                >
                  <span className="flex-1 text-left">{activeProvider?.label ?? selectedProvider}</span>
                  {activeProvider && !activeProvider.available && (
                    <span className="text-[10px] text-fg-4">key missing</span>
                  )}
                  <ChevronIcon open={providerOpen} />
                </button>
                {providerOpen && (() => {
                  const cloud = providers.filter(p => p.category === 'cloud')
                  const local = providers.filter(p => p.category === 'local')
                  const renderGroup = (label: string, items: typeof providers) => items.length > 0 && (
                    <div key={label}>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-4 bg-surface">{label}</p>
                      {items.map(p => {
                        const isActive = selectedProvider === p.id
                        return (
                          <button
                            key={p.id}
                            onClick={() => { onProvider(p.id); setProviderOpen(false) }}
                            disabled={!p.available}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                              isActive ? 'text-primary bg-primary/10' : p.available ? 'text-fg-2 hover:bg-surface-3 hover:text-fg' : 'text-fg-4 cursor-not-allowed'
                            }`}
                          >
                            <span className="flex-1 text-left">{p.label}</span>
                            {!p.available && <span className="text-[10px] opacity-60">no key</span>}
                            {isActive && <span className="ml-1 text-primary shrink-0">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )
                  return (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProviderOpen(false)} />
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                        {renderGroup('Cloud', cloud)}
                        {renderGroup('Local', local)}
                      </div>
                    </>
                  )
                })()}
              </div>
              {activeProvider && !activeProvider.available && activeProvider.category === 'cloud' && (
                <p className="mt-1.5 text-[10px] text-fg-4">
                  Set <code className="font-mono">{activeProvider.id.toUpperCase()}_API_KEY</code> and restart the server.
                </p>
              )}
              {activeProvider && activeProvider.category === 'local' && (
                <p className="mt-1.5 text-[10px] text-fg-4">
                  Local server expected at the default port. Override with <code className="font-mono">{activeProvider.id.toUpperCase()}_BASE_URL</code> if needed.
                </p>
              )}
            </div>
          )}

          {/* System prompt */}
          {flags.showSystemPromptEdit && (
          <div>
            <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-2">{t('settings.systemPrompt', 'System prompt')}</p>
            <textarea
              value={promptDraft}
              onChange={e => setPromptDraft(e.target.value)}
              onBlur={() => {
                const trimmed = promptDraft.trim()
                onSystemPrompt(trimmed.length > 0 ? trimmed : null)
              }}
              placeholder='Server default — set CHATFRAME_SYSTEM_PROMPT, or override per-user here.'
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-fg-4 outline-none focus:ring-1 focus:ring-primary/40 resize-y min-h-[4.5rem]"
            />
            {customSystemPrompt && (
              <button
                onClick={() => { setPromptDraft(''); onSystemPrompt(null) }}
                className="mt-1 text-[10px] text-fg-4 hover:text-fg-2 transition-colors"
              >
                Clear override → use server default
              </button>
            )}
          </div>
          )}

          {/* Temperature */}
          {flags.showTemperatureEdit && (
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider">{t('settings.temperature', 'Temperature')}</p>
              <span className="text-[10px] text-fg-4">
                {customTemperature !== null ? customTemperature.toFixed(2) : 'default'}
              </span>
            </div>
            <input
              type="range"
              min={0} max={2} step={0.05}
              value={customTemperature ?? 1}
              onChange={e => onTemperature(Number(e.target.value))}
              className="w-full accent-[color:var(--primary)]"
            />
            {customTemperature !== null && (
              <button
                onClick={() => onTemperature(null)}
                className="mt-1 text-[10px] text-fg-4 hover:text-fg-2 transition-colors"
              >
                {t('settings.clearOverride', 'Clear override → use server default')}
              </button>
            )}
          </div>
          )}

          {/* Data: Import / Export / Reset on a single row */}
          {flags.showImportExportReset && (
          <div>
            <p className="text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-2">{t('settings.data', 'Data')}</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={onImport}
                className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"
              >
                {t('settings.import', 'Import…')}
              </button>
              <button
                onClick={onExport}
                className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"
              >
                {t('settings.export', 'Export…')}
              </button>
              <button
                onClick={onResetAll}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
              >
                {t('settings.reset', 'Reset')}
              </button>
            </div>
          </div>
          )}
        </div>

        <div className="px-5 py-3 flex items-center justify-end text-xs text-fg-4">
          <span>{branding.name} v{APP_VERSION}</span>
        </div>
      </aside>
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

// ─── sidebar (left drawer) ───────────────────────────────────────────────────

function Sidebar({
  visible, onClose, conversations, activeId, query, setQuery,
  onSelectConv, onDeleteConv, onRenameConv, onClearAll,
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
  showClearAll: boolean
  appName: string
}) {
  const t = useT()
  const q = query.trim().toLowerCase()
  const filtered = q
    ? conversations.filter(c => c.title.toLowerCase().includes(q) ||
        c.messages.some(m => m.content.toLowerCase().includes(q)))
    : conversations

  return (
    <>
      {visible && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside className={`
        fixed top-0 left-0 z-50 h-full bg-surface shadow-[4px_0_16px_rgba(0,0,0,0.35)]
        flex flex-col overflow-hidden transition-transform duration-200 w-[260px]
        lg:relative lg:shadow-none
        ${visible ? 'translate-x-0' : '-translate-x-full lg:w-0'}
      `}>
        {/* brand + close (mobile) */}
        <div className="flex items-center justify-between px-3 py-3 shrink-0 min-w-[260px]">
          <div className="flex items-center gap-2.5">
            <ChatframeIcon />
            <span className="text-sm font-medium text-fg whitespace-nowrap">{appName}</span>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg transition-colors lg:hidden" aria-label={t('sidebar.closeSidebar', 'Close sidebar')}>
            <CloseIcon />
          </button>
        </div>

        {/* tabs-row equivalent — mighty puts Delete-all-chats here, right-aligned, under a thin divider. Chatframe has no tabs, so the row is just label + clear-all */}
        <div className="flex items-center border-b border-white/10 ml-3 mr-[17px] h-9">
          <span className="text-xs font-medium text-fg-3">{t('sidebar.chats', 'Chats')}</span>
          <div className="flex-1" />
          {showClearAll && conversations.length > 0 && (
            <button
              onClick={onClearAll}
              title="Clear all conversations"
              aria-label="Clear all conversations"
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
              placeholder={t('sidebar.searchPlaceholder', 'Search chats…')}
              className="w-full rounded-lg bg-surface-2 py-1.5 pl-7 pr-7 text-xs text-fg placeholder:text-fg-4 outline-none focus:ring-1 focus:ring-primary/40"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-2 transition-colors" aria-label="Clear search">
                <CloseIcon />
              </button>
            )}
          </div>
        </div>

        {/* conv list */}
        <div className="flex-1 overflow-y-auto py-1 [scrollbar-gutter:stable]">
          {filtered.length === 0
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
          }
        </div>

      </aside>
    </>
  )
}

// ─── message bubble ──────────────────────────────────────────────────────────

function MessageItem({ msg, streaming, isLastAssistant, onEditAndResend, onRegenerate, showActions, showSources }: {
  msg: ChatMessage
  streaming: boolean
  isLastAssistant: boolean
  onEditAndResend: (id: string, newContent: string) => void
  onRegenerate: () => void
  showActions: boolean
  showSources: boolean
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
        <div className="chatframe-assistant-bubble min-w-0 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-fg">
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
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function Home({
  initialConvId,
  appName = 'ChatFrame',
  welcomeMessage = '',
  starterPrompts = [],
  flags: serverFlags,
}: {
  initialConvId?: string
  appName?: string
  welcomeMessage?: string
  starterPrompts?: string[]
  flags?: ChatframeFlags
} = {}) {
  // Kiosk visibility flags. Source of truth is the server prop (SSR-correct,
  // no hydration mismatch). Fall back to window.__CHATFRAME when the prop is
  // missing (older callers/tests). Both ultimately resolve to "all true"
  // (full UI) when nothing's configured.
  const flags: ChatframeFlags = serverFlags ?? getChatframeFlags()
  const t = useT()
  const locale = useLocale()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sidebar visibility: default collapsed on mobile, open on lg+ (CSS handles
  // the lg:relative override; we just track the boolean).
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const [confirmDelete, setConfirmDelete] = useState<{ label: string; doDelete: () => void } | null>(null)
  const [search, setSearch] = useState('')
  const [providers, setProviders] = useState<AvailableProvider[]>([])
  const [webSearchAvailable, setWebSearchAvailable] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [mcpServers, setMcpServers] = useState<AvailableMcpServer[]>([])
  const [enabledMcps, setEnabledMcpsState] = useState<string[]>([])
  const [mcpMenuOpen, setMcpMenuOpen] = useState(false)
  const [toolRunning, setToolRunning] = useState<{ name: string; query?: string } | null>(null)
  // Generation settings: null = use server default. UI shows a placeholder
  // hint when unset so user knows what value will actually be used.
  const [customSystemPrompt, setCustomSystemPromptState] = useState<string | null>(null)
  const [customTemperature, setCustomTemperatureState] = useState<number | null>(null)
  const [provider, setProviderState] = useState<string>('anthropic')
  const [model, setModelState] = useState<string>('claude-sonnet-4-6')
  const [modelOpen, setModelOpen] = useState(false)
  // Live model list per provider id — populated lazily when the dropdown
  // opens. For local providers this is the actual installed-models list
  // returned by the local server's /v1/models endpoint.
  const [liveModels, setLiveModels] = useState<Record<string, ProviderModel[]>>({})
  const [liveModelsLoading, setLiveModelsLoading] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  // Voice — STT (mic capture → textarea) and TTS (speak assistant
  // replies). Capability is browser-determined; the UI hides each control
  // if the underlying API isn't available, so we don't fire blank buttons.
  const [voiceInputAvailable, setVoiceInputAvailable] = useState(false)
  const [voiceOutputAvailable, setVoiceOutputAvailable] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [ttsEnabled, setTtsEnabledState] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const photosInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
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
  // Always-current send() — refreshed on every render so the
  // SpeechRecognition onend callback (defined inside a useCallback with
  // its own stale closure on `input`) can invoke the up-to-date send.
  const sendRef = useRef<(() => void) | null>(null)

  // ── init ──
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    // Register the service worker so Chrome considers the app installable.
    // /sw.js is a minimal SW (fetch handler, no caching) — its presence is
    // what unlocks the "Install app" prompt; without it, "Add to home
    // screen" only creates a plain shortcut. We surface failures to the
    // console so PWA-install regressions are debuggable (was silent before
    // and that hid real errors). Doesn't throw — the chat works regardless.
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.info('[chatframe] SW registered, scope:', reg.scope))
        .catch(err => console.warn('[chatframe] SW registration failed:', err))
    }
    const t = getTheme()
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)

    // Voice capability probes. Web Speech API: SpeechRecognition (input)
    // and SpeechSynthesis (output). Both gated separately because some
    // browsers ship one without the other (Safari has TTS but limited
    // STT, Firefox the reverse).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setVoiceInputAvailable(!!SR)
    setVoiceOutputAvailable(typeof window.speechSynthesis !== 'undefined')

    // Hydrate the persisted TTS toggle. Default off — auto-speaking on
    // every visit is invasive on shared devices (kiosks, public terminals).
    const savedTts = getTtsEnabled()
    setTtsEnabledState(savedTts)
    ttsEnabledRef.current = savedTts
    // Kiosk: skip history hydration when chat persistence is off. Any
    // pre-existing localStorage entries stay untouched (a misconfiguration
    // revert shouldn't lose data) but they're not shown either.
    if (flags.persistChat) {
      const loaded = loadConversations()
      setConversations(loaded)
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
    if (flags.persistChat) {
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
        setWebSearchAvailable(!!features.webSearch)
        // Only honor the stored toggle if the operator actually has search
        // available — otherwise it'd be on but silently broken.
        if (features.webSearch) setWebSearch(getWebSearchEnabled())
        // Resolve initial provider: stored choice (if still valid + available)
        // → first available → first in list. Then resolve model the same way.
        const stored = getSelectedProvider()
        const storedIsValid = stored && list.some(p => p.id === stored && p.available)
        const firstAvailable = list.find(p => p.available)
        const chosen = storedIsValid ? stored! : (firstAvailable?.id ?? list[0]?.id ?? 'anthropic')
        setProviderState(chosen)
        const chosenInfo = list.find(p => p.id === chosen)
        const storedModel = getSelectedModel(chosen)
        const storedModelValid = storedModel && chosenInfo?.models.some(m => m.id === storedModel)
        setModelState(storedModelValid ? storedModel! : (chosenInfo?.defaultModel ?? 'claude-sonnet-4-6'))
      } catch (e) {
        console.error('providers fetch failed:', e)
      }
      // MCP servers — independent fetch, failures here just mean the picker
      // shows up empty (or not at all). Won't block the chat flow.
      try {
        const servers = await getMcpServers()
        setMcpServers(servers)
        const availableIds = new Set(servers.filter(s => s.available).map(s => s.id))
        const stored = getEnabledMcps().filter(id => availableIds.has(id))
        setEnabledMcpsState(stored)
      } catch (e) {
        console.error('mcps fetch failed:', e)
      }
    })()
  }, [])

  const handleWebSearch = useCallback((on: boolean) => {
    setWebSearch(on)
    setWebSearchEnabled(on)
  }, [])

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
    window.speechSynthesis.cancel()  // never let two utterances overlap
    const utter = new SpeechSynthesisUtterance(plain)
    // Tag the utterance with the active UI locale so the synthesizer
    // picks a matching voice instead of defaulting to browser-locale.
    utter.lang = locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US')
    window.speechSynthesis.speak(utter)
  }, [locale])

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

  const toggleMcp = useCallback((id: string) => {
    setEnabledMcpsState(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      setEnabledMcps(next)
      return next
    })
  }, [])

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

  // ── handlers ──
  const handleTheme = useCallback((t: Theme) => {
    setTheme(t)
    saveTheme(t)
    document.documentElement.setAttribute('data-theme', t)
  }, [])

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
  // MIME types we can extract text from purely client-side via FileReader.
  // Anything outside this list (currently just PDF in practice) goes to the
  // /api/extract-document endpoint for server-side handling.
  const isClientTextType = (mime: string, name: string) => {
    if (mime.startsWith('text/')) return true
    if (['application/json', 'application/xml', 'application/x-yaml'].includes(mime)) return true
    return /\.(txt|md|json|csv|xml|html?|rtf|yaml|yml|log)$/i.test(name)
  }

  const onPickFile = useCallback((kind: Attachment['kind']) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting the same file later
    if (!f) return
    // Cap to ~5MB per file to keep base64 payloads sane.
    if (f.size > 5 * 1024 * 1024) {
      setError(`Attachment "${f.name}" is too large (max 5 MB).`)
      return
    }

    if (kind === 'image') {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(f)
      }).catch(() => undefined)
      setPendingAttachments(prev => [...prev, {
        kind: 'image', name: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, dataUrl,
      }])
      return
    }

    // Document: insert a placeholder chip immediately (so the user sees
    // something happen), then extract in the background and patch the
    // attachment in place when done.
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
      let text: string
      if (isClientTextType(mimeType, f.name)) {
        text = await f.text()
      } else {
        // Need server extraction (PDF, etc). Read as base64 data URL, strip
        // the prefix, ship to /api/extract-document.
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(f)
        })
        const dataBase64 = dataUrl.split(',', 2)[1] ?? ''
        text = await extractDocument(f.name, mimeType, dataBase64)
      }
      patch({ extractedText: text })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed'
      patch({ extractError: msg })
      setError(`Couldn't extract "${f.name}": ${msg}`)
    }
  }, [])

  const removePendingAttachment = useCallback((idx: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // Core chat-run flow. Takes a fully-prepared messages array (ending with a
  // user turn). Pushes an empty assistant placeholder, streams the response
  // into it, persists. Shared by send, editAndResend, regenerate.
  const runFlowWith = useCallback(async (newMessages: ChatMessage[]) => {
    setMessages(newMessages)
    setError(null)
    setStreaming(true)

    const abort = new AbortController()
    abortRef.current = abort

    const assistantId = uuidv4()
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMsg])

    const wireMessages = buildWireMessages(newMessages)

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
          provider, model, webSearch,
          mcpServers: enabledMcps.length > 0 ? enabledMcps : undefined,
          systemPrompt: customSystemPrompt ?? undefined,
          temperature: customTemperature ?? undefined,
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
        },
      )
      const finalAssistant: ChatMessage = {
        id: assistantId, role: 'assistant', content: res.message, sources: res.sources,
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
      if (flags.persistChat) {
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
    }
  }, [activeId, conversations, provider, model, webSearch, enabledMcps, customSystemPrompt, customTemperature, buildWireMessages, updateUrl])

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
      {flags.persistChat && (
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
          appName={appName}
          showClearAll={flags.showClearAllConversations}
        />
      )}

      {/* main column */}
      <div className="flex-1 flex flex-col min-w-0 bg-bg">
        {flags.showHeader && (
        <header className="chatframe-header px-3 py-3 flex items-center gap-1 shrink-0 z-10">
          {flags.persistChat && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg transition-colors"
              title={t('header.openChats', 'Open chats')}
              aria-label={t('header.openChats', 'Open chats')}
            >
              <MenuIcon />
            </button>
          )}
          {(flags.showHeaderIcon || flags.showHeaderTitle) && (
            <span className="flex items-center gap-1.5">
              {flags.showHeaderIcon && <ChatframeIcon />}
              {flags.showHeaderTitle && <h1 className="text-sm font-medium text-fg">{appName}</h1>}
            </span>
          )}
          <div className="flex-1" />
          {/* Single kebab menu — holds reload, new chat, download, delete,
              settings. Reload is unconditional so the menu is always
              rendered; the other items are state/flag-gated. */}
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
                  <div className="absolute right-0 top-full z-40 mt-1 min-w-[12rem] rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden">
                    <button
                      onClick={() => { setHeaderMenuOpen(false); window.location.reload() }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg hover:bg-surface-3 transition-colors"
                    >
                      <RefreshIcon />
                      <span>{t('header.refresh', 'Reload')}</span>
                    </button>
                    {flags.persistChat && (
                      <button
                        onClick={() => { setHeaderMenuOpen(false); newConversation() }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg hover:bg-surface-3 transition-colors"
                      >
                        <NewChatIcon />
                        <span>{t('header.newChat', 'New chat')}</span>
                      </button>
                    )}
                    {flags.showDownloadChat && messages.length > 0 && (
                      <button
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          const conv: Conversation = activeId
                            ? (conversations.find(c => c.id === activeId)
                                ?? { id: activeId, title: 'Chat', messages, createdAt: Date.now(), updatedAt: Date.now() })
                            : { id: 'unsaved', title: autoTitle(messages), messages, createdAt: Date.now(), updatedAt: Date.now() }
                          const safeTitle = conv.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'chatframe-chat'
                          downloadTextFile(conversationToMarkdown(conv), `${safeTitle}.md`, 'text/markdown')
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg hover:bg-surface-3 transition-colors"
                      >
                        <DownloadIcon />
                        <span>{t('header.downloadChat', 'Download chat')}</span>
                      </button>
                    )}
                    {activeId && flags.persistChat && (
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
                    {flags.showSettings && (
                      <button
                        onClick={() => { setHeaderMenuOpen(false); setSettingsOpen(true) }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg hover:bg-surface-3 transition-colors"
                      >
                        <GearIcon />
                        <span>{t('header.settings', 'Settings')}</span>
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
                        <div className="chatframe-assistant-bubble min-w-0 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-fg">
                          <div className="prose prose-sm max-w-none [&>*]:my-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-surface-2 [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock, table: TableBlock }}>{welcomeMessage}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                  : starterPrompts.length === 0 && (
                    <div className="text-center py-16 text-fg-4 text-sm">
                      Start a conversation.
                    </div>
                  )
                }
                {starterPrompts.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {starterPrompts.map((prompt, i) => (
                      <button
                        key={i}
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
                showActions={flags.showMessageActions}
                showSources={flags.showSourcesCitations}
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
        <div className="chatframe-composer px-4 pb-4 pt-2 shrink-0">
          {/* hidden file inputs */}
          <input ref={cameraInputRef}   type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickFile('image')} />
          <input ref={photosInputRef}   type="file" accept="image/*"                         className="hidden" onChange={onPickFile('image')} />
          <input ref={documentInputRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.json,.csv,.xml,.html,.htm,.rtf,.yaml,.yml,.log" className="hidden" onChange={onPickFile('document')} />

          <div className="chatframe-composer-pill max-w-3xl mx-auto rounded-3xl border border-white/10 transition-colors focus-within:border-primary/40">
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

            {/* Model pill — moved above the textarea so it has its own row
                instead of competing for space with the action buttons at
                the bottom. Hidden in kiosk mode → server uses CHATFRAME_PROVIDER
                + CHATFRAME_MODEL env defaults regardless of any stored client
                preference. */}
            {providers.length > 0 && flags.showModelPicker && (() => {
              const providerInfo = providers.find(p => p.id === provider)
              if (!providerInfo) return null
              const modelsForDropdown = liveModels[providerInfo.id] ?? providerInfo.models
              const allKnownModels = [...providerInfo.models, ...(liveModels[providerInfo.id] ?? [])]
              const modelInfo = allKnownModels.find(m => m.id === model)
              const openDropdown = async () => {
                setModelOpen(o => !o)
                if (modelOpen) return
                if (providerInfo.category === 'local' && !liveModels[providerInfo.id]) {
                  setLiveModelsLoading(true)
                  try {
                    const res = await getProviderModels(providerInfo.id)
                    setLiveModels(prev => ({ ...prev, [providerInfo.id]: res.models }))
                  } catch (e) {
                    console.warn('live models fetch failed:', e)
                  } finally {
                    setLiveModelsLoading(false)
                  }
                }
              }
              return (
                <div className="px-2.5 pt-2.5 flex items-center gap-1.5">
                  {/* Provider pill — read-only attribution. Sits left of the
                   *  model picker so the picker label (e.g. "GPT-4o", "Llama
                   *  3.1 8B") doesn't have to carry attribution. Same pill
                   *  shape as the model picker for visual rhythm; muted bg +
                   *  no chevron + no hover state so it reads as informational
                   *  rather than clickable. */}
                  <span
                    className="inline-flex items-center rounded-lg border border-white/10 bg-surface-3 px-2.5 py-1.5 text-xs text-fg-3"
                    title={`Provider: ${providerInfo.label}`}
                  >
                    <span className="truncate max-w-[10rem]">{providerInfo.label}</span>
                  </span>
                  <div className="relative">
                  <button
                    onClick={openDropdown}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"
                    title={`${providerInfo.label} — change model`}
                  >
                    <span className="truncate max-w-[10rem]">{modelInfo?.label ?? model}</span>
                    <ChevronIcon open={modelOpen} />
                  </button>
                  {modelOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setModelOpen(false)} />
                      {/* Opens upward (bottom-full mb-1) — the composer
                          lives at the bottom of the viewport on mobile,
                          so dropping DOWN runs the menu off the fold.
                          Floating UP into the chat area is the only
                          direction that keeps the full list visible. */}
                      <div className="absolute left-0 bottom-full z-40 mb-1 min-w-[14rem] rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden max-h-[50vh] overflow-y-auto">
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-4 bg-surface flex items-center justify-between">
                          <span>{providerInfo.label}</span>
                          {providerInfo.category === 'local' && liveModelsLoading && <span className="text-fg-4">…</span>}
                        </p>
                        {modelsForDropdown.length === 0 ? (
                          <p className="px-3 py-3 text-[11px] text-fg-4">
                            {providerInfo.category === 'local'
                              ? 'No models installed. Pull or load one on the server.'
                              : 'No models available.'}
                          </p>
                        ) : modelsForDropdown.map(m => {
                          const isActive = model === m.id
                          return (
                            <button
                              key={m.id}
                              onClick={() => { handleModel(m.id); setModelOpen(false) }}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                                isActive ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                              }`}
                            >
                              <span className="flex-1 text-left">{m.label}</span>
                              {isActive && <span className="text-primary shrink-0">✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                  </div>{/* /relative model-picker wrapper */}
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
                {/* attach button — hidden in kiosk when attachments are off */}
                {flags.showAttachments && (
                  <div className="relative">
                    <button
                      onClick={() => setAttachMenuOpen(o => !o)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg transition-colors"
                      title={t('composer.attach', 'Attach')}
                      aria-label={t('composer.attachFile', 'Attach a file')}
                    >
                      <AttachIcon />
                    </button>
                    {attachMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setAttachMenuOpen(false)} />
                        <div className="absolute left-0 bottom-full z-40 mb-1 min-w-[10rem] rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden">
                          <button
                            onClick={() => { setAttachMenuOpen(false); cameraInputRef.current?.click() }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"
                          >
                            <CameraSmIcon /> {t('composer.camera', 'Camera')}
                          </button>
                          <button
                            onClick={() => { setAttachMenuOpen(false); photosInputRef.current?.click() }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"
                          >
                            <PhotoIcon /> {t('composer.photos', 'Photos')}
                          </button>
                          <button
                            onClick={() => { setAttachMenuOpen(false); documentInputRef.current?.click() }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"
                          >
                            <DocumentIcon /> {t('composer.documents', 'Documents')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {/* TTS toggle — speak assistant replies via Web Speech API
                    once the stream completes. Hidden when the browser
                    doesn't expose speechSynthesis (rare) or the operator
                    disabled it via CHATFRAME_SHOW_VOICE_OUTPUT=0. Off by
                    default (auto-speak is invasive on shared devices);
                    preference persists via localStorage. */}
                {voiceOutputAvailable && flags.showVoiceOutput && (
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
                {/* Web search toggle — only when server has TAVILY_API_KEY
                    AND the kiosk hasn't hidden the button. When hidden, the
                    server forces web search ON for every message. */}
                {webSearchAvailable && flags.showWebSearch && (
                  <button
                    onClick={() => handleWebSearch(!webSearch)}
                    title={webSearch
                      ? t('composer.webSearchOn', 'Web search: ON — click to turn off')
                      : t('composer.webSearchOff', 'Web search: off — click to turn on')}
                    aria-label={t('composer.webSearchOff', 'Toggle web search')}
                    aria-pressed={webSearch}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      webSearch
                        ? 'text-primary bg-primary/15 hover:bg-primary/25'
                        : 'text-fg-3 hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    <GlobeIcon />
                  </button>
                )}
                {/* MCP picker — opens a menu of available servers; user
                    checks one or more to include in the next message.
                    Hidden in kiosk mode → server enables every configured
                    MCP server on every request. */}
                {mcpServers.length > 0 && flags.showMcp && (
                  <div className="relative">
                    <button
                      onClick={() => setMcpMenuOpen(o => !o)}
                      title={enabledMcps.length > 0
                        ? `MCP: ${enabledMcps.length} active — click to manage`
                        : 'MCP: none active — click to enable'}
                      aria-label="Toggle MCP servers"
                      aria-pressed={enabledMcps.length > 0}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        enabledMcps.length > 0
                          ? 'text-primary bg-primary/15 hover:bg-primary/25'
                          : 'text-fg-3 hover:bg-surface-2 hover:text-fg'
                      }`}
                    >
                      <McpIcon />
                    </button>
                    {mcpMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setMcpMenuOpen(false)} />
                        <div className="absolute left-0 bottom-full z-40 mb-1 min-w-[14rem] rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden">
                          <div className="px-3 py-2 text-[10px] font-semibold text-fg-3 uppercase tracking-wider border-b border-white/10">
                            MCP servers
                          </div>
                          {mcpServers.map(s => {
                            const checked = enabledMcps.includes(s.id)
                            const disabled = !s.available
                            return (
                              <button
                                key={s.id}
                                disabled={disabled}
                                onClick={() => toggleMcp(s.id)}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                                  disabled
                                    ? 'text-fg-4 cursor-not-allowed'
                                    : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                                }`}
                              >
                                <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                                  checked ? 'border-primary bg-primary/20 text-primary' : 'border-white/20'
                                }`}>
                                  {checked && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  )}
                                </span>
                                <span className="flex-1 truncate">{s.label}</span>
                                <span className="text-[10px] text-fg-4">
                                  {disabled ? 'offline' : `${s.toolCount} tools`}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {/* Mic — toggle SpeechRecognition. Locale auto-picked
                    from navigator.language so non-English users get the
                    right recognizer by default. Auto-sends on silence
                    (recognition.onend) — voice flow goes question →
                    transcript → send without a tap. Hidden when the
                    browser doesn't expose SpeechRecognition OR the
                    operator disabled it via CHATFRAME_SHOW_VOICE_INPUT=0.
                    Disabled while streaming to avoid mid-reply input. */}
                {voiceInputAvailable && flags.showVoiceInput && (
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
          providers={providers}
          selectedProvider={provider}
          onProvider={handleProvider}
          customSystemPrompt={customSystemPrompt}
          onSystemPrompt={handleSystemPrompt}
          customTemperature={customTemperature}
          onTemperature={handleTemperature}
          onExport={() => {
            const data = exportAll()
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `chatframe-export-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
          onImport={() => importJsonRef.current?.click()}
          onResetAll={() => setConfirmDelete({
            label: 'all data (every conversation, theme, provider, model preference, generation settings, and session token)',
            doDelete: () => {
              resetAllData()
              window.location.replace('/')
            },
          })}
          onClose={() => setSettingsOpen(false)}
          flags={flags}
        />
      )}
      {confirmDelete && (
        <DeleteConfirmModal
          label={confirmDelete.label}
          onConfirm={() => { confirmDelete.doDelete(); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
