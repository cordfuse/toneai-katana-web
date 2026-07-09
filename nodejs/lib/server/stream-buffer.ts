// In-memory replay buffer for chat SSE streams.
//
// The browser-side cause we're solving for: Chrome on Android kills in-flight
// fetch readers when a tab is backgrounded. The server keeps streaming into a
// dead socket, the client sees a "network error" on return. With this buffer,
// the client can hit a replay endpoint with Last-Event-ID and pick up where
// it left off — no lost tokens, no retry of the LLM call.
//
// Single-instance only (Map in process memory). Streams are evicted on
// completion + a 5-minute TTL ceiling so the server doesn't leak memory if a
// client never reconnects. For multi-instance deploys, swap the Map for Redis.
import { randomUUID } from 'node:crypto'

// One event in the stream. `id` is the monotonic sequence number we expose
// to the client via SSE's `id:` field (and consume via Last-Event-ID on
// replay). `payload` is the SSE-formatted body (`data: ...\n\n` or a comment
// like `: ping\n\n`).
interface BufferedEvent {
  id: number
  payload: string
}

type Subscriber = (event: BufferedEvent) => void

interface StreamState {
  events: BufferedEvent[]
  nextId: number
  done: boolean
  subscribers: Set<Subscriber>
  createdAt: number
}

const TTL_MS = 5 * 60 * 1000          // evict streams older than 5 min
const CLEANUP_INTERVAL_MS = 60 * 1000 // sweep every minute

const streams = new Map<string, StreamState>()

// Periodic eviction so a never-reconnecting client doesn't leak forever.
// Started lazily on the first stream creation to avoid keeping the process
// alive in test contexts that import the module without using it.
let cleanupTimer: NodeJS.Timeout | null = null
function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, state] of streams) {
      if (now - state.createdAt > TTL_MS) {
        // Notify any lingering subscribers that this stream is gone, so they
        // close their HTTP responses instead of hanging forever.
        for (const sub of state.subscribers) {
          sub({ id: -1, payload: 'data: {"type":"error","message":"Stream expired"}\n\n' })
        }
        streams.delete(id)
      }
    }
  }, CLEANUP_INTERVAL_MS)
  cleanupTimer.unref()
}

export function createStream(): { streamId: string; push: (payload: string) => number; finish: () => void } {
  ensureCleanup()
  const streamId = randomUUID()
  const state: StreamState = {
    events: [],
    nextId: 1,
    done: false,
    subscribers: new Set(),
    createdAt: Date.now(),
  }
  streams.set(streamId, state)

  const push = (payload: string): number => {
    const id = state.nextId++
    const event: BufferedEvent = { id, payload }
    state.events.push(event)
    // Fan out to any live replay subscribers tailing the stream.
    for (const sub of state.subscribers) {
      try { sub(event) } catch { /* subscriber will be cleaned up by its own writer */ }
    }
    return id
  }

  const finish = () => {
    state.done = true
    // Subscribers will see the `done` event in their normal flow and close.
  }

  return { streamId, push, finish }
}

// Subscribe to a stream for replay + live tail. Returns the events that occurred
// AFTER `afterId` (so a client with Last-Event-ID=5 gets 6, 7, 8, ...), and
// registers a subscriber for live events. Caller must invoke `unsubscribe`
// when their HTTP response is closed.
export interface ReplayHandle {
  past: BufferedEvent[]
  done: boolean
  subscribe: (cb: Subscriber) => () => void
}

export function attachReplay(streamId: string, afterId: number): ReplayHandle | null {
  const state = streams.get(streamId)
  if (!state) return null
  const past = state.events.filter(e => e.id > afterId)
  return {
    past,
    done: state.done,
    subscribe: (cb: Subscriber) => {
      state.subscribers.add(cb)
      return () => state.subscribers.delete(cb)
    },
  }
}

// Evict a completed stream early when the original client confirms receipt
// (currently unused — TTL eviction is sufficient; reserved for future).
export function dropStream(streamId: string) {
  streams.delete(streamId)
}
