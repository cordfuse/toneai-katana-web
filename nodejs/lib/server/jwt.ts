import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod'

export function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token: string): { deviceId: string } {
  return jwt.verify(token, JWT_SECRET) as { deviceId: string }
}

export function getDeviceIdFromRequest(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    return verifyToken(authHeader.slice(7)).deviceId
  } catch {
    return null
  }
}
