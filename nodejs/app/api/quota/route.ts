// Read-only view of the global free-tier counter. Backs the navbar pill.
//
// force-dynamic: the count changes with every free request from any user,
// so this must never be statically rendered or cached.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { readQuota } from '@/lib/server/quota'

export async function GET() {
  const { remaining, limit } = readQuota()
  // resetsAt: next UTC midnight. The pill shows it so an exhausted quota
  // reads as "comes back at a known time" rather than "broken".
  const now = new Date()
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return NextResponse.json({ remaining, limit, resetsAt: resetsAt.toISOString() })
}
