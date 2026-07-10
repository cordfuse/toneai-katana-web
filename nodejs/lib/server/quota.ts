// Free-tier quota: a single global daily ceiling.
//
// Only the FREE path consumes quota. A request carrying the user's own
// Anthropic key (BYOK) never reaches this module.
//
// One counter, keyed on the UTC date so it rolls over without a cron:
//
//   daily_quota   global — the shared pool the UI counts down from
//
// There is intentionally NO per-device sub-cap: users track exactly one number,
// the same one the navbar pill shows.
//
// NOTE ON ATOMICITY: `mighty-ai-qr-web/lib/server/quota.ts` does SELECT →
// compare → UPDATE, which over-serves under concurrency (two requests at
// limit-1 both read limit-1, both pass, both increment). The increment here
// is a single statement with the bound in the WHERE clause, so a row is
// returned only if the increment actually happened.

import db from './db'

export const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT ?? '1000', 10)

/** UTC date, `YYYY-MM-DD`. The quota resets at midnight UTC. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface QuotaResult {
  allowed: boolean
  /** Remaining in the global pool — what the navbar pill renders. */
  remaining: number
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
 * Consume one free-tier request from the global pool.
 */
export function checkAndIncrementQuota(): QuotaResult {
  const date = today()

  db.prepare('INSERT OR IGNORE INTO daily_quota (date, count) VALUES (?, 0)').run(date)
  const globalRow = db
    .prepare(
      `UPDATE daily_quota SET count = count + 1
        WHERE date = ? AND count < ?
        RETURNING count`,
    )
    .get(date, FREE_DAILY_LIMIT) as unknown as CountRow | undefined

  if (!globalRow) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: Math.max(0, FREE_DAILY_LIMIT - globalRow.count) }
}
