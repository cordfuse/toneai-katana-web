// Server-only locale resolver. Reads the chatframe_locale cookie via Next's
// headers() API and falls back to the server default (CHATFRAME_LOCALE env, or
// 'en'). Returns a locale code guaranteed to exist in the available set so
// downstream code can index `translations[locale]` without nullish checks.

import { cookies } from 'next/headers'

export async function resolveLocale(
  availableLocales: string[],
  defaultLocale: string,
): Promise<string> {
  const fallback = availableLocales.includes(defaultLocale)
    ? defaultLocale
    : (availableLocales.includes('en') ? 'en' : (availableLocales[0] ?? 'en'))
  try {
    const c = await cookies()
    const cookieVal = c.get('chatframe_locale')?.value
    if (cookieVal && availableLocales.includes(cookieVal)) return cookieVal
  } catch { /* cookies() outside request scope — use default */ }
  return fallback
}
