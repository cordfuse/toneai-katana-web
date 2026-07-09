// Branding + custom theme config. RUNTIME-loaded from chatframe.config.json so
// dropping a new file on a hosted instance takes effect on the next request
// — no rebuild required. Server-only (uses fs); client code receives values
// via SSR (server components pass as props, or layout.tsx injects them into
// the rendered HTML).
//
// File lookup precedence:
//   1. $CHATFRAME_CONFIG_PATH if set (explicit file)
//   2. $CHATFRAME_CONFIG_DIR/chatframe.config.json if set (operator-mounted volume)
//   3. <cwd>/config/chatframe.config.json (default convention; the standalone
//      server chdirs to .next/standalone/, so we also probe its ancestors)
//   4. <cwd>/chatframe.config.json (legacy path, kept for ad-hoc setups)

import fs from 'node:fs'
import path from 'node:path'
import { BUILT_IN_LOCALES, type LocalizableString, type LocalizableStringArray } from './i18n'

// Single source of truth for the customization directory. Used by the
// config loader, the MCP loader, and the icon-serving route. Set
// CHATFRAME_CONFIG_DIR to mount a different volume; default `./config` keeps
// dev simple — the repo ships a populated config/ dir.
export function getConfigDir(): string {
  if (process.env.CHATFRAME_CONFIG_DIR) return process.env.CHATFRAME_CONFIG_DIR
  return path.join(process.cwd(), 'config')
}

const CSS_VAR_KEYS = [
  'bg', 'surface', 'surface-2', 'surface-3',
  'primary', 'on-primary',
  'fg', 'fg-2', 'fg-3', 'fg-4',
  'scrollbar', 'scrollbar-h',
  'error-bg', 'error-border', 'error-fg',
] as const

export type ThemeColorKey = (typeof CSS_VAR_KEYS)[number]

export interface CustomTheme {
  id: string
  name: string
  category: 'dark' | 'light'
  swatches?: [string, string, string]
  colors: Partial<Record<ThemeColorKey, string>>
}

export interface ChatframeConfig {
  name: string
  shortName: string
  // Localizable: plain string (used for every locale) OR per-locale map
  // ({ en: "...", es: "...", ... }). Resolved server-side using the active
  // request locale before reaching the client. See lib/i18n/index.ts
  // resolveLocalizableString.
  tagline: LocalizableString
  defaultSystemPrompt: LocalizableString
  welcomeMessage: LocalizableString
  // Clickable prompt chips shown below the welcome bubble. Localizable:
  // plain array OR per-locale map of arrays.
  starterPrompts: LocalizableStringArray
  checkForUpdatesUrl: string
  defaultTheme: string
  hideBuiltInThemes: boolean
  themes: CustomTheme[]
  // Icon paths (web-relative, served from public/). Used for the browser
  // favicon AND the PWA manifest. icon192 drives both; icon512 is PWA only.
  // Default points at the bundled feather. Forkers drop their PNGs in
  // public/ (any subdir works) and update these paths.
  icon192: string
  icon512: string
}

const defaults: ChatframeConfig = {
  name: 'ChatFrame',
  shortName: 'ChatFrame',
  tagline: 'Embeddable AI chatbot framework',
  defaultSystemPrompt: 'You are a helpful AI assistant.',
  welcomeMessage: '',
  starterPrompts: [],
  checkForUpdatesUrl: 'https://github.com/cordfuse/chatframe/releases',
  defaultTheme: 'dracula',
  hideBuiltInThemes: false,
  themes: [],
  icon192: '/branding/icon-192.png',
  icon512: '/branding/icon-512.png',
}

const BUILT_IN_THEME_IDS = [
  // dark
  'oled', 'dracula', 'one-dark', 'tokyo-night', 'nord', 'solarized-dark',
  'gruvbox-dark', 'monokai', 'catppuccin-mocha', 'night-owl',
  'synthwave', 'github-dark', 'palenight',
  // light
  'solarized-light', 'github-light', 'catppuccin-latte',
  'one-light', 'tokyo-night-light', 'ayu-light', 'gruvbox-light',
  'quiet-light', 'light-plus', 'material-lighter', 'nord-light', 'min-light',
]

const BUILT_IN_BG_FALLBACK = '#282a36'  // Dracula bg, matches :root in globals.css

function locateConfigFile(): string | null {
  const explicit = process.env.CHATFRAME_CONFIG_PATH
  if (explicit) {
    try { if (fs.statSync(explicit).isFile()) return explicit } catch { /* fall through */ }
    return null
  }
  const dir = getConfigDir()
  const candidates = [
    path.join(dir, 'chatframe.config.json'),
    // Standalone server chdirs to .next/standalone/ — when CHATFRAME_CONFIG_DIR
    // resolves to a relative ./config that doesn't exist there, walk up.
    path.join(process.cwd(), '..', 'config', 'chatframe.config.json'),
    path.join(process.cwd(), '..', '..', 'config', 'chatframe.config.json'),
    // Legacy ad-hoc paths (file directly in CWD or a parent).
    path.join(process.cwd(), 'chatframe.config.json'),
    path.join(process.cwd(), '..', 'chatframe.config.json'),
    path.join(process.cwd(), '..', '..', 'chatframe.config.json'),
  ]
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) return p
    } catch { /* try next */ }
  }
  return null
}

export interface KioskFlags {
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
  // v0.7.0 — operator-suppression flags for kiosk / whitelabel / regulated
  // deployments. All default ON to keep the full-UI experience for plain forks.
  showSystemPromptEdit: boolean     // hide the system-prompt textarea in settings
  showTemperatureEdit: boolean      // hide the temperature slider in settings
  showImportExportReset: boolean    // hide the import / export / reset row in settings
  showDownloadChat: boolean         // hide the "Download chat" entry in the kebab menu
  showClearAllConversations: boolean // hide the "Clear all" button in the sidebar
  showMessageActions: boolean       // hide per-message copy / edit / regenerate buttons
  showSourcesCitations: boolean     // hide web-search source attribution under assistant replies
}

interface LoadedConfig {
  config: ChatframeConfig
  themeCss: string
  // Raw CSS read from <configDir>/custom.css (if the file exists). Injected
  // into <head> after themeCss so it can override any built-in token. Sourced
  // from a real CSS file so operators get proper editor support — no JSON
  // string escaping. Drop the file and refresh; no rebuild.
  customCss: string
  allowedThemeIds: string[]
  defaultTheme: string
  themeColor: string
  flags: KioskFlags
  // i18n: all locale maps merged together (built-ins + any operator JSON
  // dropped in <configDir>/locales/*.json). Sent to the client wholesale
  // so t() lookups are sync. List of locale codes ordered alphabetically
  // with English first for picker display.
  locales: Record<string, Record<string, string>>
  localeCodes: string[]
  // Server-default locale: env CHATFRAME_LOCALE if set and valid, else 'en'.
  // The actual rendered locale per-request is resolved from the cookie
  // (see resolveLocale in lib/i18n/server.ts) using this as fallback.
  defaultLocale: string
}

// Kiosk visibility flags. All default ON (full UI). Setting any to '0' or
// 'false' hides the corresponding control. A hidden control means the feature
// runs server-side with whatever's configured (web search uses TAVILY if set;
// MCP uses every server in chatframe-mcp.json; model picker uses CHATFRAME_PROVIDER +
// CHATFRAME_MODEL). To disable a feature entirely, don't configure it.
function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name]
  if (v === undefined || v === '') return defaultValue
  if (v === '0' || v.toLowerCase() === 'false') return false
  if (v === '1' || v.toLowerCase() === 'true') return true
  return defaultValue
}

export function loadKioskFlags(): KioskFlags {
  return {
    showHeader:      envBool('CHATFRAME_SHOW_HEADER',       true),
    showHeaderIcon:  envBool('CHATFRAME_SHOW_HEADER_ICON',  true),
    showHeaderTitle: envBool('CHATFRAME_SHOW_HEADER_TITLE', true),
    showSettings:    envBool('CHATFRAME_SHOW_SETTINGS',     true),
    persistChat:     envBool('CHATFRAME_PERSIST_CHAT',      true),
    showWebSearch:   envBool('CHATFRAME_SHOW_WEB_SEARCH',   true),
    showMcp:         envBool('CHATFRAME_SHOW_MCP',          true),
    showModelPicker: envBool('CHATFRAME_SHOW_MODEL_PICKER', true),
    showAttachments: envBool('CHATFRAME_SHOW_ATTACHMENTS',  true),
    showVoiceInput:  envBool('CHATFRAME_SHOW_VOICE_INPUT',  true),
    showVoiceOutput: envBool('CHATFRAME_SHOW_VOICE_OUTPUT', true),
    showSystemPromptEdit:      envBool('CHATFRAME_SHOW_SYSTEM_PROMPT_EDIT',      true),
    showTemperatureEdit:       envBool('CHATFRAME_SHOW_TEMPERATURE_EDIT',        true),
    showImportExportReset:     envBool('CHATFRAME_SHOW_IMPORT_EXPORT_RESET',     true),
    showDownloadChat:          envBool('CHATFRAME_SHOW_DOWNLOAD_CHAT',           true),
    showClearAllConversations: envBool('CHATFRAME_SHOW_CLEAR_ALL_CONVERSATIONS', true),
    showMessageActions:        envBool('CHATFRAME_SHOW_MESSAGE_ACTIONS',         true),
    showSourcesCitations:      envBool('CHATFRAME_SHOW_SOURCES',                 true),
  }
}

// Reads the file fresh each call. JSON is tiny (~1KB) and Node caches the
// directory lookup; the read itself is microseconds. No memoization here is
// intentional — we want drop-file-and-refresh behavior.
export function loadChatframeConfig(): LoadedConfig {
  const file = locateConfigFile()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any = {}
  if (file) {
    try { raw = JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { /* fall through to defaults */ }
  }

  // Helpers — accept either the plain shape (backwards compat) or a
  // per-locale map. An object with at least one string value is treated
  // as a locale map; anything else falls back to the default.
  const parseLocalizableString = (v: unknown, fb: LocalizableString): LocalizableString => {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sanitized: Record<string, string> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string') sanitized[k] = val
      }
      if (Object.keys(sanitized).length > 0) return sanitized
    }
    return fb
  }
  const parseLocalizableStringArray = (v: unknown, fb: LocalizableStringArray): LocalizableStringArray => {
    if (Array.isArray(v)) {
      return v.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    }
    if (v && typeof v === 'object') {
      const sanitized: Record<string, string[]> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (Array.isArray(val)) {
          sanitized[k] = val.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        }
      }
      if (Object.keys(sanitized).length > 0) return sanitized
    }
    return fb
  }

  const config: ChatframeConfig = {
    name: typeof raw.name === 'string' ? raw.name : defaults.name,
    shortName: typeof raw.shortName === 'string' ? raw.shortName : defaults.shortName,
    tagline: parseLocalizableString(raw.tagline, defaults.tagline),
    defaultSystemPrompt: parseLocalizableString(raw.defaultSystemPrompt, defaults.defaultSystemPrompt),
    welcomeMessage: parseLocalizableString(raw.welcomeMessage, defaults.welcomeMessage),
    starterPrompts: parseLocalizableStringArray(raw.starterPrompts, defaults.starterPrompts),
    checkForUpdatesUrl: typeof raw.checkForUpdatesUrl === 'string' ? raw.checkForUpdatesUrl : defaults.checkForUpdatesUrl,
    defaultTheme: typeof raw.defaultTheme === 'string' ? raw.defaultTheme : defaults.defaultTheme,
    hideBuiltInThemes: raw.hideBuiltInThemes === true,
    icon192: typeof raw.icon192 === 'string' ? raw.icon192 : defaults.icon192,
    icon512: typeof raw.icon512 === 'string' ? raw.icon512 : defaults.icon512,
    themes: Array.isArray(raw.themes) ? raw.themes.filter((t: unknown): t is CustomTheme => {
      return !!t && typeof t === 'object'
        && typeof (t as CustomTheme).id === 'string'
        && typeof (t as CustomTheme).name === 'string'
        && (t as CustomTheme).colors !== undefined
    }) : defaults.themes,
  }

  const themeCss = config.themes
    .map(t => {
      const vars = Object.entries(t.colors)
        .filter(([k]) => (CSS_VAR_KEYS as readonly string[]).includes(k))
        .map(([k, v]) => `  --${k}: ${v};`)
        .join('\n')
      return `[data-theme="${t.id}"] {\n${vars}\n}`
    })
    .join('\n')

  const allowedThemeIds: string[] = [
    ...(config.hideBuiltInThemes ? [] : BUILT_IN_THEME_IDS),
    ...config.themes.map(t => t.id),
  ]

  const defaultTheme: string =
    allowedThemeIds.includes(config.defaultTheme) ? config.defaultTheme :
    allowedThemeIds.includes('dracula') ? 'dracula' :
    (allowedThemeIds[0] ?? 'dracula')

  const themeColor = config.themes.find(t => t.id === defaultTheme)?.colors.bg ?? BUILT_IN_BG_FALLBACK

  // Optional operator stylesheet. Lives next to chatframe.config.json in the
  // mounted config volume so it can be edited with full editor support
  // (syntax highlighting, etc.) rather than as an escaped JSON string.
  // Missing file is normal — most deployments don't need it.
  let customCss = ''
  try {
    customCss = fs.readFileSync(path.join(getConfigDir(), 'custom.css'), 'utf-8')
  } catch { /* file absent — no custom CSS for this deployment */ }

  // i18n: merge built-in locales with any operator-supplied JSON files in
  // <configDir>/locales/. Operator JSON may override a built-in key or add
  // an entirely new locale. Same drop-file-and-refresh ergonomics as
  // custom.css and chatframe-mcp.json.
  const locales: Record<string, Record<string, string>> = {}
  for (const [code, map] of Object.entries(BUILT_IN_LOCALES)) locales[code] = { ...map }
  const localesDir = path.join(getConfigDir(), 'locales')
  try {
    for (const f of fs.readdirSync(localesDir)) {
      if (!f.endsWith('.json')) continue
      const code = f.replace(/\.json$/, '')
      try {
        const raw = fs.readFileSync(path.join(localesDir, f), 'utf-8')
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // String-valued entries only — silently skip anything else.
          const sanitized: Record<string, string> = {}
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === 'string') sanitized[k] = v
          }
          locales[code] = { ...(locales[code] ?? {}), ...sanitized }
        }
      } catch { /* malformed JSON — skip this file, keep going */ }
    }
  } catch { /* locales dir absent — built-ins only */ }
  const localeCodes = Object.keys(locales).sort((a, b) =>
    a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)
  )
  const envLocale = (process.env.CHATFRAME_LOCALE ?? '').trim()
  const defaultLocale = envLocale && locales[envLocale] ? envLocale : 'en'

  return {
    config, themeCss, customCss,
    allowedThemeIds, defaultTheme, themeColor,
    flags: loadKioskFlags(),
    locales, localeCodes, defaultLocale,
  }
}

// Built-in theme IDs — re-exported so client-side code can use them as a
// fallback (when SSR-injected allowed list isn't available, e.g. during
// initial render bootstrap).
export const BUILT_IN_THEMES = BUILT_IN_THEME_IDS
