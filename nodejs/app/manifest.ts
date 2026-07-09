import type { MetadataRoute } from 'next'
import { loadChatframeConfig } from '@/lib/config'
import { resolveLocalizableString } from '@/lib/i18n'

// PWA manifest. Read from chatframe.config.json on each request so dropping a
// new config file picks up immediately (browser/OS will still cache the
// installed PWA's shortcut icon — that's outside our control).
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function manifest(): MetadataRoute.Manifest {
  const { config, themeColor, defaultLocale } = loadChatframeConfig()
  // Manifest uses the deploy-default locale (not per-request cookie):
  // the browser caches the installed PWA's manifest, so picking a per-
  // request locale here would only be visible during install. Defaulting
  // to CHATFRAME_LOCALE keeps the installed-app description stable.
  return {
    // No `id` field — Chrome falls back to start_url ('/') as the canonical
    // PWA identifier. Previously we set `id: "/?app=<shortName>"` which (a)
    // varied if the operator changed shortName (causing Chrome to treat
    // it as a brand-new app) and (b) included a query string that doesn't
    // match start_url. Symptoms: "Add to home screen" only made a browser
    // shortcut instead of installing the PWA. Default behaviour is what
    // every working PWA (open-webui, etc.) does — omit id, let start_url
    // serve as the implicit canonical identifier.
    name: config.name,
    short_name: config.shortName,
    description: resolveLocalizableString(config.tagline, defaultLocale),
    start_url: '/',
    display: 'standalone',
    background_color: themeColor,
    theme_color: themeColor,
    // Only `purpose: 'any'`. The bundled icons aren't designed with
    // safe-zone padding for the maskable spec, so declaring them as
    // maskable would render the feather clipped on devices that use
    // the mask. Operators with proper maskable assets can add their
    // own entries via a forked manifest.
    icons: [
      { src: config.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: config.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
