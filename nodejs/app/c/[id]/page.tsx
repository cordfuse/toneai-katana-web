import Home from '../../_Home'
import { loadChatframeConfig } from '@/lib/config'
import { resolveLocale } from '@/lib/i18n/server'
import { resolveLocalizableString, resolveLocalizableStringArray } from '@/lib/i18n'

// Dynamic route /c/<convId>. Passes the URL's conv id as initialConvId
// so a hard refresh (or shared link) on a conv URL restores that
// conversation. Soft in-app navigation updates the URL via
// history.replaceState — that doesn't re-mount Home, so drafts and
// sidebar state survive between conv switches.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { config, localeCodes, defaultLocale } = loadChatframeConfig()
  const activeLocale = await resolveLocale(localeCodes, defaultLocale)
  return (
    <Home
      initialConvId={id}
      appName={config.name}
      iconUrl={config.icon192}
      welcomeMessage={resolveLocalizableString(config.welcomeMessage, activeLocale)}
      starterPrompts={resolveLocalizableStringArray(config.starterPrompts, activeLocale)}
    />
  )
}
