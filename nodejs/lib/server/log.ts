// Server-side diagnostic log. Writes scrubbed entries to the `logs` table in
// katana.db, scoped by deviceId so /api/logs can return only the requesting
// device's rows. The client merges those with its own buffer at download time.
//
// Retention is bounded by AGE, pruned opportunistically on write — the app is
// low-volume and the index makes the delete cheap, so no cron is needed.

import db from './db'
import { scrub, scrubString } from '@/lib/log/scrub'
import type { LogEntry, LogLevel } from '@/lib/log/types'

const RETENTION_MS = 3 * 24 * 60 * 60 * 1000 // 72h
// Prune roughly once every N writes rather than on every insert.
const PRUNE_EVERY = 25
let writeCount = 0

/**
 * Record one server event for a device. Best-effort: a logging failure must
 * never break a chat request, so everything is wrapped and swallowed.
 *
 * BOTH `ctx` and `msg` are scrubbed. `ctx` always was; `msg` was NOT, which was a
 * real hole — `msg` carries provider error text, and a provider is free to quote
 * request material back at us. An Anthropic key must not reach this table, and
 * "the SDK doesn't currently echo it" is not a safeguard.
 */
export function slog(
  deviceId: string,
  requestId: string | undefined,
  level: LogLevel,
  event: string,
  msg?: string,
  ctx?: Record<string, unknown>,
): void {
  if (!db) return
  try {
    const ctxJson = ctx ? JSON.stringify(scrub(ctx)) : null
    db.prepare(
      `INSERT INTO logs (ts, device_id, request_id, level, event, msg, ctx)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(Date.now(), deviceId, requestId ?? null, level, event, msg ? scrubString(msg).slice(0, 8000) : null, ctxJson)

    if (++writeCount % PRUNE_EVERY === 0) {
      db.prepare('DELETE FROM logs WHERE ts < ?').run(Date.now() - RETENTION_MS)
    }
  } catch {
    /* diagnostics are never load-bearing */
  }
}

interface LogRow {
  ts: number
  request_id: string | null
  level: string
  event: string
  msg: string | null
  ctx: string | null
}

/** Return this device's server log entries (chronological), for the download. */
export function getLogsForDevice(deviceId: string, sinceTs = 0, limit = 2000): LogEntry[] {
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT ts, request_id, level, event, msg, ctx FROM logs
         WHERE device_id = ? AND ts >= ? ORDER BY ts ASC LIMIT ?`,
      )
      .all(deviceId, sinceTs, limit) as unknown as LogRow[]
    return rows.map((r) => ({
      ts: r.ts,
      source: 'server' as const,
      level: r.level as LogLevel,
      event: r.event,
      requestId: r.request_id ?? undefined,
      msg: r.msg ?? undefined,
      ctx: r.ctx ? (JSON.parse(r.ctx) as Record<string, unknown>) : undefined,
    }))
  } catch {
    return []
  }
}
