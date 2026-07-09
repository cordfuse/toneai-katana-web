import { NextRequest, NextResponse } from 'next/server'
import { signToken } from '@/lib/server/jwt'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { deviceId } = body

  if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 8) {
    return NextResponse.json({ error: 'Invalid deviceId' }, { status: 400 })
  }

  const token = signToken({ deviceId })
  return NextResponse.json({ token })
}
