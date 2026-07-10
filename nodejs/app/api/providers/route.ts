import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { getAvailableProviders, hasNativeWebSearch } from '@/lib/server/ai-tools'

export async function GET(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    providers: getAvailableProviders(),
    features: { webSearch: hasNativeWebSearch('anthropic') },
  })
}
