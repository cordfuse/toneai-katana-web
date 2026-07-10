// Lightweight i18n for Chatframe. No framework dependency.
//
// Design notes:
// - Strings are keyed (e.g. 'header.openChats'), with the English fallback
//   inlined at the call site as the second arg to t(). Missing keys render
//   the fallback, so partial translations don't break the UI and new strings
//   can ship without coordinating translation updates.
// - Locale resolution: per-request (server reads the chatframe_locale cookie),
//   pinned for the page lifecycle. Switching locale persists the cookie and
//   forces a reload — no React context churn, no SSR hydration mismatch.
// - Operators can drop <configDir>/locales/<code>.json to override built-in
//   strings OR introduce an entirely new locale. Server merges those onto
//   the built-in maps at request time (no rebuild).

import en from './locales/en'

export type LocaleCode = string  // 'en', 'es', 'fr-CA', etc.
export type Translations = Record<string, string>

// ToneAI Kat ships ENGLISH ONLY. The es/fr/de locale maps were deleted and the
// language picker removed from Settings. The t(key, 'English fallback') plumbing
// stays: every call site already carries its English string inline, so this is
// where the rendered text actually comes from — ripping t() out would touch 70+
// sites and change nothing on screen.
//
// Operators can still drop <configDir>/locales/<code>.json to add a locale.
export const BUILT_IN_LOCALES: Record<LocaleCode, Translations> = { en }

export interface LocaleInfo {
  code: LocaleCode
  label: string  // human-readable, in its own language ("Español", "Deutsch")
}

export const BUILT_IN_LOCALE_INFO: LocaleInfo[] = [
  { code: 'en', label: 'English' },
]

// Make a t() function bound to a specific translation map. Each component
// that needs translations imports its own t from the React context (see
// I18nProvider), but the same function shape is used everywhere.
export function makeT(translations: Translations): (key: string, fallback: string) => string {
  return (key, fallback) => translations[key] ?? fallback
}

// ─── Localizable operator content ──────────────────────────────────────────
// Operator-supplied fields in chatframe.config.json (welcomeMessage, starter
// prompts, system prompt, tagline) accept either a plain value or a
// per-locale map. Backwards compatible: existing configs with plain
// strings continue to work; operators that ship multi-language deployments
// add a { en: "...", es: "...", de: "..." } shape per field.

export type LocalizableString = string | Record<string, string>
export type LocalizableStringArray = string[] | Record<string, string[]>

export function resolveLocalizableString(value: LocalizableString, locale: string): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    return value[locale] ?? value['en'] ?? Object.values(value)[0] ?? ''
  }
  return ''
}

export function resolveLocalizableStringArray(value: LocalizableStringArray, locale: string): string[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    return value[locale] ?? value['en'] ?? Object.values(value)[0] ?? []
  }
  return []
}

// Human-readable language name for system-prompt augmentation
// ("Respond in <name>."). Falls back to the locale code itself for
// custom locales the operator added — the model still understands ISO
// codes well enough to respond appropriately.
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
}

export function languageNameForLocale(code: string): string {
  return LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES[code.split('-')[0]] ?? code
}
