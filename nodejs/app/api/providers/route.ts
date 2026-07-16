import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { getAvailableProviders, hasNativeWebSearch } from '@/lib/server/ai-tools'
import { isByokOnly } from '@/lib/server/models'

export async function GET(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    providers: getAvailableProviders(),
    features: {
      webSearch: hasNativeWebSearch('anthropic'),
      // Whether the server can serve free-tier requests. Needs its own key AND
      // not being in deliberate BYOK-only (retired) mode. When false, the client
      // hides the free-quota pill and steers to BYOK, rather than advertising
      // free requests that would all fail. TONEAI_BYOK_ONLY is the single switch:
      // set it and free mode is off coherently across the whole UI, key or no key.
      freeTier: !!process.env.ANTHROPIC_API_KEY && !isByokOnly(),
    },
  })
}
