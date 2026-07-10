import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { getLogsForDevice } from '@/lib/server/log'

export const dynamic = 'force-dynamic'

// Returns the server-side diagnostic log for the CALLING device only. The
// device JWT both authenticates and scopes the query — a device can never read
// another device's entries. The client merges these with its own buffer to
// build the downloadable file.
export async function GET(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sinceRaw = request.nextUrl.searchParams.get('since')
  const since = sinceRaw ? Number(sinceRaw) : 0
  const entries = getLogsForDevice(deviceId, Number.isFinite(since) ? since : 0)

  return NextResponse.json({ entries })
}
