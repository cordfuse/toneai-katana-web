// Free-tier quota: a global daily ceiling plus a per-device sub-cap.
//
// Only the FREE path consumes quota. A request carrying the user's own
// Anthropic key (BYOK) never reaches this module.
//
// Two counters, both keyed on the UTC date so they roll over without a cron:
//
//   daily_quota   global  — the shared pool the UI counts down from
//   device_quota  per-device — stops one client draining the pool for everyone
//
// NOTE ON ATOMICITY: `mighty-ai-qr-web/lib/server/quota.ts` does SELECT →
// compare → UPDATE, which over-serves under concurrency (two requests at
// limit-1 both read limit-1, both pass, both increment). The increments here
// are single statements with the bound in the WHERE clause, so a row is
// returned only if the increment actually happened.

import db from './db'

export const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT ?? '1000', 10)
export const FREE_DEVICE_DAILY_LIMIT = parseInt(process.env.FREE_DEVICE_DAILY_LIMIT ?? '10', 10)

/** UTC date, `YYYY-MM-DD`. The quota resets at midnight UTC. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export type QuotaDenial = 'global_exhausted' | 'device_exhausted'

export interface QuotaResult {
  allowed: boolean
  /** Remaining in the GLOBAL pool — what the navbar pill renders. */
  remaining: number
  reason?: QuotaDenial
}

interface CountRow { count: number }

/**
 * Read the global counter without consuming it. Backs `GET /api/quota`.
 */
export function readQuota(): { remaining: number; limit: number } {
  const row = db
    .prepare('SELECT count FROM daily_quota WHERE date = ?')
    .get(today()) as unknown as CountRow | undefined
  return {
    remaining: Math.max(0, FREE_DAILY_LIMIT - (row?.count ?? 0)),
    limit: FREE_DAILY_LIMIT,
  }
}

/**
 * Consume one free-tier request for `deviceId`.
 *
 * Checks the per-device sub-cap FIRST: a device that has exhausted its own
 * allowance must not decrement the global pool, or a single abusive client
 * still drains everyone else's budget one rejected request at a time.
 */
export function checkAndIncrementQuota(deviceId: string): QuotaResult {
  const date = today()

  db.prepare('INSERT OR IGNORE INTO device_quota (date, device_id, count) VALUES (?, ?, 0)').run(date, deviceId)
  const deviceRow = db
    .prepare(
      `UPDATE device_quota SET count = count + 1
        WHERE date = ? AND device_id = ? AND count < ?
        RETURNING count`,
    )
    .get(date, deviceId, FREE_DEVICE_DAILY_LIMIT) as unknown as CountRow | undefined

  if (!deviceRow) {
    return { allowed: false, remaining: readQuota().remaining, reason: 'device_exhausted' }
  }

  db.prepare('INSERT OR IGNORE INTO daily_quota (date, count) VALUES (?, 0)').run(date)
  const globalRow = db
    .prepare(
      `UPDATE daily_quota SET count = count + 1
        WHERE date = ? AND count < ?
        RETURNING count`,
    )
    .get(date, FREE_DAILY_LIMIT) as unknown as CountRow | undefined

  if (!globalRow) {
    // Global pool is dry. Give the device its slot back — it did nothing
    // wrong, and charging it for a request that never ran would silently
    // shrink its allowance for the rest of the day.
    db.prepare('UPDATE device_quota SET count = count - 1 WHERE date = ? AND device_id = ?').run(date, deviceId)
    return { allowed: false, remaining: 0, reason: 'global_exhausted' }
  }

  return { allowed: true, remaining: Math.max(0, FREE_DAILY_LIMIT - globalRow.count) }
}
