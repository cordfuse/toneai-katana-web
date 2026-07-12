// Read-only view of the free tier: this device's allowance AND the shared pool.
// Backs the Usage modal.
//
// Auth is OPTIONAL by design. The page can ask before its first auth round-trip
// completes, and the pool figure is an aggregate that gives nothing away — so an
// unauthenticated caller still gets the global numbers and simply sees a full
// device allowance. With a token, the device's real remaining count is included.
//
// force-dynamic: the counts change with every free request from any user, so this
// must never be statically rendered or cached.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { readQuota } from '@/lib/server/quota'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'

export async function GET(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization')) ?? undefined
  const { device, global } = readQuota(deviceId)

  // resetsAt: next UTC midnight. Shown so an exhausted quota reads as "comes back
  // at a known time" rather than "broken".
  const now = new Date()
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

  return NextResponse.json({
    device,
    global,
    resetsAt: resetsAt.toISOString(),
    /** Whether the caller was identified. False → `device` is a placeholder. */
    identified: !!deviceId,
  })
}
