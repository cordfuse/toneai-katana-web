import { NextRequest } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { getConfigDir } from '@/lib/config'

// Serves files from <configDir>/icons/<path>. Lets forkers drop branded
// PNGs into their mounted config volume and reference them from
// toneai.config.json as e.g. "/branding/my-logo-192.png" — no rebuild,
// no public/ change. force-dynamic so a new file is picked up on the
// next request without warming a build-time cache.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const MIME: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.gif':  'image/gif',
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params
  if (!parts || parts.length === 0) return new Response('Not found', { status: 404 })

  // Path traversal guard: collapse the request path and reject anything
  // that escapes the icons subdir. path.normalize handles ../ chains;
  // we also verify the resolved file lives inside the icons root.
  const iconsRoot = path.resolve(getConfigDir(), 'icons')
  const requested = path.normalize(path.join(iconsRoot, ...parts))
  if (!requested.startsWith(iconsRoot + path.sep) && requested !== iconsRoot) {
    return new Response('Not found', { status: 404 })
  }

  let bytes: Buffer
  try {
    bytes = fs.readFileSync(requested)
  } catch {
    return new Response('Not found', { status: 404 })
  }

  const contentType = MIME[path.extname(requested).toLowerCase()] ?? 'application/octet-stream'
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      // No cache while a forker is iterating on their logo. The whole
      // point is drop-file-and-refresh.
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
