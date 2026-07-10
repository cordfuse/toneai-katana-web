import Home from './_Home'
import { loadToneaiConfig } from '@/lib/config'
import { resolveLocale } from '@/lib/i18n/server'
import { resolveLocalizableString, resolveLocalizableStringArray } from '@/lib/i18n'

// Root route. Server-reads toneai.config.json so the in-bubble app name
// matches the rebrand on first paint (no hydration mismatch when a fork
// changes the name). force-dynamic so a config-file change picks up on
// the next request without a rebuild.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const { config, localeCodes, defaultLocale } = loadToneaiConfig()
  const activeLocale = await resolveLocale(localeCodes, defaultLocale)
  return (
    <Home
      appName={config.name}
      welcomeMessage={resolveLocalizableString(config.welcomeMessage, activeLocale)}
      starterPrompts={resolveLocalizableStringArray(config.starterPrompts, activeLocale)}
    />
  )
}
