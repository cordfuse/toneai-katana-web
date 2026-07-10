'use client'

// Client-side i18n surface. Provider receives the server-resolved locale +
// merged translations dict and exposes a useT() hook for components. Locale
// changes write a cookie and reload — no React-state churn, no SSR/hydration
// mismatch (next request renders directly in the chosen locale).

import { createContext, useContext } from 'react'
import { makeT, type Translations } from './index'

interface I18nValue {
  locale: string
  availableLocales: string[]
  t: (key: string, fallback: string) => string
}

const noopT = (_k: string, fallback: string) => fallback

const I18nContext = createContext<I18nValue>({
  locale: 'en',
  availableLocales: ['en'],
  t: noopT,
})

export function I18nProvider({
  locale,
  translations,
  availableLocales,
  children,
}: {
  locale: string
  translations: Translations
  availableLocales: string[]
  children: React.ReactNode
}) {
  const t = makeT(translations)
  return (
    <I18nContext.Provider value={{ locale, availableLocales, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useT() {
  return useContext(I18nContext).t
}

export function useLocale() {
  return useContext(I18nContext).locale
}

export function useAvailableLocales() {
  return useContext(I18nContext).availableLocales
}

// Persist the chosen locale as a non-HttpOnly cookie (max age 1 year) and
// reload so the server re-renders in the new locale. Cookie path '/' so
// every ToneAI Kat page resolves the same way. Adds `Secure` when on HTTPS
// (required by some browsers' modern cookie policies even with SameSite=Lax)
// and bypasses bfcache with location.assign so the new cookie definitely
// reaches the server on next render.
export function setLocaleAndReload(loc: string) {
  if (typeof document === 'undefined') return
  const oneYear = 60 * 60 * 24 * 365
  const secure = (typeof window !== 'undefined' && window.location.protocol === 'https:') ? ';Secure' : ''
  document.cookie = `toneai_locale=${encodeURIComponent(loc)};path=/;max-age=${oneYear};SameSite=Lax${secure}`
  // Verify the cookie actually stuck — surfaces silent rejections (some
  // browser policies refuse cookies in specific contexts).
  if (!document.cookie.split(';').some(c => c.trim().startsWith('toneai_locale='))) {
    console.warn('[toneai] locale cookie failed to set; the browser may have rejected it')
    return
  }
  // location.assign(location.href) forces a fresh network request and
  // bypasses bfcache, which can otherwise restore a pre-cookie page state
  // and render the OLD locale despite the cookie being set.
  window.location.assign(window.location.href)
}

// Human-readable labels for built-in locales. Custom (operator-supplied)
// locales fall back to the code itself.
export const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  tr: 'Türkçe',
}

export function labelForLocale(code: string): string {
  return LOCALE_LABELS[code] ?? code
}
