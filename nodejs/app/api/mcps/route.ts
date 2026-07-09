import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { listServers } from '@/lib/server/mcp'

export async function GET(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const servers = await listServers()
  return NextResponse.json({ servers })
}
