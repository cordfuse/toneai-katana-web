import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { loadChatframeConfig } from '@/lib/config'
import { resolveLocale } from '@/lib/i18n/server'
import { I18nProvider } from '@/lib/i18n/client'
import { resolveLocalizableString, resolveLocalizableStringArray } from '@/lib/i18n'
import './globals.css'

// Re-render the layout per request so a config-file change picks up on the
// next page load without a rebuild.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Modern UI font — Inter is the de-facto open alternative to Google Sans
// (used by Vercel, OpenAI, etc.). next/font/google self-hosts at build,
// no runtime fetch, no FOUT. Exposed as --font-sans for globals.css.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

// Metadata + viewport are exported as functions so they run per-request
// instead of being baked at build (Next allows both — async/sync funcs
// trigger dynamic evaluation). Lets the config file changes flow without
// rebuild.
export async function generateMetadata(): Promise<Metadata> {
  const { config, localeCodes, defaultLocale } = loadChatframeConfig()
  const activeLocale = await resolveLocale(localeCodes, defaultLocale)
  return {
    title: config.name,
    description: resolveLocalizableString(config.tagline, activeLocale),
    icons: { apple: config.icon192, icon: config.icon192 },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const { themeColor } = loadChatframeConfig()
  return { themeColor, width: 'device-width', initialScale: 1 }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { config, themeCss, customCss, allowedThemeIds, defaultTheme, locales, localeCodes, defaultLocale } = loadChatframeConfig()

  // Resolve the per-request locale: cookie wins, else server default.
  // Done server-side so SSR renders directly in the chosen locale —
  // no hydration mismatch, no first-paint flash.
  const activeLocale = await resolveLocale(localeCodes, defaultLocale)
  const activeTranslations = locales[activeLocale] ?? {}

  // Inline pre-hydration theme bootstrap: build a JS map of allowed theme
  // IDs (built-ins + custom) so the picker's stored choice validates before
  // React hydrates. Also stashes the config on window so client code can
  // read branding (header text, footer link) without a server round-trip.
  const themeBootstrap = `(function(){try{var T={${allowedThemeIds.map(id => `'${id}':1`).join(',')}};var t=localStorage.getItem('katana_theme');document.documentElement.setAttribute('data-theme',T[t]?t:'${defaultTheme}')}catch(e){}})()`
  // Resolve any localizable operator content to the active locale BEFORE
  // shipping it to the client. The client never sees the per-locale map
  // shape — by the time strings hit window.__CHATFRAME, they're plain values
  // matching the active locale. (Languages-resolved-at-server-render is
  // the same pattern as t() lookups; consistent locale story.)
  const resolvedTagline = resolveLocalizableString(config.tagline, activeLocale)
  const resolvedWelcome = resolveLocalizableString(config.welcomeMessage, activeLocale)
  const resolvedStarters = resolveLocalizableStringArray(config.starterPrompts, activeLocale)

  const configBootstrap = `window.__CHATFRAME=${JSON.stringify({
    name: config.name,
    shortName: config.shortName,
    tagline: resolvedTagline,
    welcomeMessage: resolvedWelcome,
    starterPrompts: resolvedStarters,
    checkForUpdatesUrl: config.checkForUpdatesUrl,
    defaultTheme,
    allowedThemeIds,
    customThemes: config.themes,
    locale: activeLocale,
    availableLocales: localeCodes,
  })};`

  return (
    <html
      lang={activeLocale}
      translate="no"
      className={`h-dvh notranslate ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Block browser auto-translate (Chrome on Android is the
            common offender). Chatframe's own i18n handles language
            switching; auto-translate would clobber strings, break
            voice locale alignment, and produce confusing mismatches
            between picked language and visible text. The translate="no"
            attribute is the HTML5 standard signal; the `notranslate`
            class is Chrome's older hint; the meta tag is the
            Google-specific belt-and-braces. User can still manually
            translate from the Chrome menu if they really want. */}
        <meta name="google" content="notranslate" />
        {themeCss && (
          <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        )}
        {customCss && (
          // Operator stylesheet, read from <configDir>/custom.css if
          // present. Loaded AFTER the theme block so deployments can
          // override any built-in theme variable (--surface, --header-bg,
          // --font-sans, etc.) or add @font-face / @import rules for
          // custom fonts. The </style> escape guards against accidental
          // injection from the operator's own CSS (comments, selectors).
          <style dangerouslySetInnerHTML={{ __html: customCss.replace(/<\/style/gi, '<\\/style') }} />
        )}
        <script dangerouslySetInnerHTML={{ __html: configBootstrap + themeBootstrap }} />
      </head>
      <body className="h-dvh overflow-hidden">
        <I18nProvider
          locale={activeLocale}
          translations={activeTranslations}
          availableLocales={localeCodes}
        >
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
