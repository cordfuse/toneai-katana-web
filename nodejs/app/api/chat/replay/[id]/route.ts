import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { attachReplay } from '@/lib/server/stream-buffer'

// Reconnect endpoint for in-flight chat streams. The original POST returns an
// `X-Chatframe-Stream-Id` header; the client stashes it and the last SSE event id
// it received. If the reader dies mid-flight (mobile tab backgrounded,
// proxy timeout, network blip), the client calls this with the streamId in
// the URL and `Last-Event-ID` in headers to pick up exactly where it left off.
//
// Returns 404 if the buffer doesn't have that streamId — either it never
// existed or its 5-minute TTL has elapsed and the buffer was evicted.

export const maxDuration = 300

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: streamId } = await ctx.params

  // Last-Event-ID: replay everything strictly after this point. Missing or
  // bad input → start from the beginning (replay the whole buffer).
  const lastIdRaw = request.headers.get('Last-Event-ID')
  const lastId = lastIdRaw ? parseInt(lastIdRaw, 10) : 0
  const afterId = Number.isFinite(lastId) && lastId >= 0 ? lastId : 0

  const handle = attachReplay(streamId, afterId)
  if (!handle) {
    // Stream is unknown / evicted. Client must restart the chat.
    return NextResponse.json({ error: 'Stream not found or expired' }, { status: 404 })
  }

  console.log(`[chat] replay ${streamId} from id=${afterId} (past=${handle.past.length}, done=${handle.done})`)

  const enc = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const safeEnqueue = (chunk: Uint8Array): boolean => {
        if (closed) return false
        try { controller.enqueue(chunk); return true }
        catch { closed = true; return false }
      }

      // Heartbeat (same pattern as the POST handler).
      const PING = enc.encode(': ping\n\n')
      const heartbeat = setInterval(() => {
        if (!safeEnqueue(PING)) clearInterval(heartbeat)
      }, 8000)

      // 1) Drain the buffered tail synchronously.
      for (const e of handle.past) {
        if (!safeEnqueue(enc.encode(`id: ${e.id}\n${e.payload}`))) break
      }

      // 2) If the producer already finished, we have nothing live to wait for.
      if (handle.done) {
        clearInterval(heartbeat)
        if (!closed) try { controller.close() } catch {}
        return
      }

      // 3) Subscribe for live events until the terminal one arrives.
      const unsubscribe = handle.subscribe(e => {
        const ok = safeEnqueue(enc.encode(`id: ${e.id}\n${e.payload}`))
        const isTerminal = e.payload.includes('"type":"done"') || e.payload.includes('"type":"error"')
        if (!ok || isTerminal) {
          unsubscribe()
          clearInterval(heartbeat)
          if (!closed) try { controller.close() } catch {}
        }
      })
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection:      'keep-alive',
    },
  })
}
