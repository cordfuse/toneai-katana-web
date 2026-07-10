// Client-side diagnostic log: an in-memory ring buffer mirrored to localStorage
// so it survives a reload. Capped at CAP entries. Everything is scrubbed on the
// way in. This is the "what the browser saw" half of the downloadable log —
// chat request/response summaries, console errors, unhandled rejections.

import { scrub } from './scrub'
import type { LogEntry, LogLevel } from './types'

const CAP = 500
const LS_KEY = 'toneai_client_log'

let buf: LogEntry[] | null = null

function store(): LogEntry[] {
  if (buf) return buf
  buf = []
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) buf = JSON.parse(raw) as LogEntry[]
    } catch {
      /* corrupt buffer — start clean */
    }
  }
  return buf
}

function persist(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store()))
  } catch {
    /* quota/serialisation failure must never break the app */
  }
}

/** Append one entry. `ctx` is deep-scrubbed; a secret can never enter the log. */
export function clog(
  level: LogLevel,
  event: string,
  msg?: string,
  ctx?: Record<string, unknown>,
  requestId?: string,
): void {
  try {
    const b = store()
    b.push({
      ts: Date.now(),
      source: 'client',
      level,
      event,
      requestId,
      msg: msg ? String(msg).slice(0, 4000) : undefined,
      ctx: ctx ? (scrub(ctx) as Record<string, unknown>) : undefined,
    })
    if (b.length > CAP) b.splice(0, b.length - CAP)
    persist()
  } catch {
    /* logging must be best-effort and never throw into a caller */
  }
}

export function getClientLog(): LogEntry[] {
  return [...store()]
}

export function clearClientLog(): void {
  buf = []
  persist()
}

// Install global capture once: uncaught errors, promise rejections, and a
// console.error tap. Idempotent — safe to call from a React effect on every
// mount.
let installed = false
export function installClientLogCapture(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (e) => {
    clog('error', 'window.error', String(e.message), {
      filename: e.filename,
      line: e.lineno,
      col: e.colno,
    })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason
    clog('error', 'unhandledrejection', reason instanceof Error ? reason.message : String(reason))
  })

  const orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    try {
      clog(
        'error',
        'console.error',
        args.map((a) => (typeof a === 'string' ? a : safeString(a))).join(' '),
      )
    } catch {
      /* never let the tap break real logging */
    }
    orig(...args)
  }
}

function safeString(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
