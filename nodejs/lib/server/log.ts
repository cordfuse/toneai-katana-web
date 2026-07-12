// Server-side diagnostic log. Writes scrubbed entries to the `logs` table in
// katana.db, scoped by deviceId so /api/logs can return only the requesting
// device's rows. The client merges those with its own buffer at download time.
//
// Retention is bounded by AGE, pruned opportunistically on write — the app is
// low-volume and the index makes the delete cheap, so no cron is needed.

import db from './db'
import { scrub, scrubString } from '@/lib/log/scrub'
import type { LogEntry, LogLevel } from '@/lib/log/types'

// 30 days. Was 72h, which was fine when the log existed only to back a user's
// "download diagnostics" button — but the operator log route reads this same
// table, and a 3-day window cannot answer "what did last month cost?". Rows are a
// few hundred bytes and the persistent disk is 1 GB; at even 500 requests/day
// that is a few MB a month. Age-pruned on write, so still no cron.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
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

// ─── Operator queries (admin route) ──────────────────────────────────────────
//
// Everything below reads ACROSS all devices and is reachable only through
// app/api/admin/logs, which is gated on ADMIN_TOKEN (see lib/server/admin.ts).
// Nothing here is exposed to a user-facing route.

/** One row of the operator view. `deviceId` is included — an operator needs to
 *  see that 40 refusals came from ONE device rather than forty. */
export interface AdminLogEntry extends LogEntry {
  deviceId: string
}

export interface AdminLogQuery {
  /** Epoch ms lower bound (inclusive). */
  sinceTs?: number
  /** Epoch ms upper bound (exclusive). */
  untilTs?: number
  /** Exact event match, e.g. 'chat.rejected'. */
  event?: string
  /** Minimum level: 'warn' returns warn + error. */
  level?: LogLevel
  limit?: number
  /**
   * Include the prompt text users typed.
   *
   * OFF BY DEFAULT, and that default is the point. `chat.request` rows carry up to
   * 500 characters of what a user wrote. With this false, the default response is
   * safe to paste into a chat, an issue, or a screenshot without disclosing
   * anyone's prompts — which is exactly what an operator does with telemetry when
   * debugging. Seeing what people asked for is legitimate product research; it
   * should just be a deliberate act, not a side effect of checking the error rate.
   */
  includePrompts?: boolean
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

interface AdminLogRow extends LogRow {
  device_id: string
}

/** Placeholder substituted for user prompt text when includePrompts is false. */
const PROMPT_OMITTED = '[prompt omitted — pass prompts=1 to include]'

export function queryLogs(q: AdminLogQuery = {}): AdminLogEntry[] {
  if (!db) return []
  const limit = Math.min(Math.max(q.limit ?? 500, 1), 5000)
  try {
    const where: string[] = ['ts >= ?', 'ts < ?']
    const args: (string | number)[] = [q.sinceTs ?? 0, q.untilTs ?? Number.MAX_SAFE_INTEGER]
    if (q.event) { where.push('event = ?'); args.push(q.event) }
    if (q.level) {
      const allowed = (Object.keys(LEVEL_ORDER) as LogLevel[])
        .filter(l => LEVEL_ORDER[l] >= LEVEL_ORDER[q.level as LogLevel])
      where.push(`level IN (${allowed.map(() => '?').join(',')})`)
      args.push(...allowed)
    }
    args.push(limit)

    const rows = db
      .prepare(
        `SELECT ts, device_id, request_id, level, event, msg, ctx FROM logs
         WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT ?`,
      )
      .all(...args) as unknown as AdminLogRow[]

    return rows.map((r) => ({
      ts: r.ts,
      source: 'server' as const,
      level: r.level as LogLevel,
      event: r.event,
      deviceId: r.device_id,
      requestId: r.request_id ?? undefined,
      // Only chat.request carries a user's own words. Rejections and responses
      // carry our text ("quota exhausted (device)", "tone: Rebel Rebel"), which is
      // not a disclosure — so they are never withheld.
      msg: r.event === 'chat.request' && !q.includePrompts
        ? (r.msg ? PROMPT_OMITTED : undefined)
        : (r.msg ?? undefined),
      ctx: r.ctx ? (JSON.parse(r.ctx) as Record<string, unknown>) : undefined,
    }))
  } catch {
    return []
  }
}

/** The numbers an operator actually keeps asking for, computed in SQL rather than
 *  by shipping thousands of rows to be counted by hand. */
export interface AdminSummary {
  sinceTs: number
  untilTs: number
  requests: number
  responses: number
  errors: number
  /** Refusals, split by cause. `global` means the pool ran dry and EVERYONE was
   *  locked out — if that is non-zero, the daily cap is too low. */
  rejected: { total: number; device: number; global: number; other: number }
  /** Spend, split by WHO PAID. `ours` is the only figure that lands on the
   *  operator's Anthropic bill; `theirs` is BYOK users spending their own money. */
  estUsd: { ours: number; theirs: number }
  /** Tones actually delivered. */
  tones: number
  /** Distinct devices seen. */
  devices: number
  /** Model mix, by request count. */
  models: Record<string, number>
}

interface CtxShape {
  estUsd?: number
  keyOwner?: string
  blockedBy?: string
  model?: string
  tone?: string
}

export function summarizeLogs(sinceTs: number, untilTs: number): AdminSummary {
  const empty: AdminSummary = {
    sinceTs, untilTs, requests: 0, responses: 0, errors: 0,
    rejected: { total: 0, device: 0, global: 0, other: 0 },
    estUsd: { ours: 0, theirs: 0 }, tones: 0, devices: 0, models: {},
  }
  if (!db) return empty

  try {
    const rows = db
      .prepare(
        `SELECT device_id, level, event, ctx FROM logs WHERE ts >= ? AND ts < ?`,
      )
      .all(sinceTs, untilTs) as unknown as { device_id: string; level: string; event: string; ctx: string | null }[]

    const devices = new Set<string>()
    const out = { ...empty, rejected: { ...empty.rejected }, estUsd: { ...empty.estUsd }, models: {} as Record<string, number> }

    for (const r of rows) {
      devices.add(r.device_id)
      let ctx: CtxShape = {}
      if (r.ctx) { try { ctx = JSON.parse(r.ctx) as CtxShape } catch { /* a bad row must not break the report */ } }

      if (r.event === 'chat.request') {
        out.requests++
        if (ctx.model) out.models[ctx.model] = (out.models[ctx.model] ?? 0) + 1
      } else if (r.event === 'chat.response') {
        out.responses++
        if (ctx.tone) out.tones++
        // The cost is only OURS when the request ran on the server's key. A rollup
        // that ignores keyOwner bills the operator for tones BYOK users paid for
        // themselves — a BYOK Opus tone is ~$0.30 and would badly distort this.
        if (typeof ctx.estUsd === 'number') {
          if (ctx.keyOwner === 'user') out.estUsd.theirs += ctx.estUsd
          else out.estUsd.ours += ctx.estUsd
        }
      } else if (r.event === 'chat.rejected') {
        out.rejected.total++
        if (ctx.blockedBy === 'device') out.rejected.device++
        else if (ctx.blockedBy === 'global') out.rejected.global++
        else out.rejected.other++
      } else if (r.event === 'chat.error') {
        out.errors++
      }
      if (r.level === 'error' && r.event !== 'chat.error') out.errors++
    }

    out.devices = devices.size
    out.estUsd.ours = Math.round(out.estUsd.ours * 10000) / 10000
    out.estUsd.theirs = Math.round(out.estUsd.theirs * 10000) / 10000
    return out
  } catch {
    return empty
  }
}
