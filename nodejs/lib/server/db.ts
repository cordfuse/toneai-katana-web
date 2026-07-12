// SQLite store for the free-tier quota.
//
// `node:sqlite` is used WITHOUT `--experimental-sqlite`: the flag is required
// on Node 22 but not on Node 24+, and this repo forbids experimental flags
// (see CLAUDE.md). docker/Dockerfile pins node:24-alpine for that reason.
// Do NOT reintroduce the flag, and do NOT swap in better-sqlite3 — a native
// addon is a heavier dependency than this needs.
//
// The only state here is one integer per UTC date. Everything else about a
// session lives in the browser.

import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data/katana.db')

// Skip DB initialisation during the Next.js build phase. Routes are
// force-dynamic and never execute their handlers at build time, but the
// module is still imported for static analysis — which would otherwise try
// to create a data/ directory inside the build image.
let db: DatabaseSync

if (process.env.NEXT_PHASE !== 'phase-production-build') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec(`
    -- Global free-tier counter. One row per UTC date; the date rolls the
    -- quota over implicitly, so there is no cron job to reset anything. This is
    -- the ONLY quota — no per-device sub-cap; users track one number.
    CREATE TABLE IF NOT EXISTS daily_quota (
      date  TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );

    -- Per-device free-tier counter, one row per (UTC date, device). Sits UNDER
    -- the global pool above: the device cap is the fairness limit (one visitor
    -- can't drain the day for everyone), the global one is the budget limit.
    -- Same implicit date rollover, so no cron. See lib/server/quota.ts.
    CREATE TABLE IF NOT EXISTS daily_quota_device (
      date      TEXT NOT NULL,
      device_id TEXT NOT NULL,
      count     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, device_id)
    );

    -- Server-side diagnostic log. Rows are scoped to a device so a user can
    -- download only their own server events (see lib/server/log.ts +
    -- app/api/logs). Retention is bounded by age on every write — no cron.
    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      device_id  TEXT NOT NULL,
      request_id TEXT,
      level      TEXT NOT NULL,
      event      TEXT NOT NULL,
      msg        TEXT,
      ctx        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_device_ts ON logs (device_id, ts);

    -- Records that an operator-requested quota reset has already run for a given
    -- UTC date. Makes the reset IDEMPOTENT across restarts: Render recycles a
    -- container on every deploy, on a crash, and on an instance replacement, and
    -- without this a crash loop on reset day would re-zero the counters on every
    -- boot — silently removing the daily cap entirely. See applyQuotaReset().
    CREATE TABLE IF NOT EXISTS quota_reset (
      date       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)
  applyQuotaReset(db)
} else {
  db = null as unknown as DatabaseSync
}

/**
 * Operator-requested quota reset — a goodwill "everyone gets their allowance
 * back today" switch, driven entirely from the environment. Runs once at boot.
 *
 *     QUOTA_RESET_DATE=2026-07-12
 *
 * Set it to TODAY'S UTC date and redeploy: today's global and per-device counters
 * are zeroed. No admin endpoint, no shell access, no secret to leak.
 *
 * WHY A DATE AND NOT A BOOLEAN. A bare flag (QUOTA_RESET=1) fires on every boot,
 * and the app cannot unset its own environment variable. Render restarts a
 * container on deploys, crashes and instance recycles — so a flag left set would
 * silently re-zero the quota forever, which is the same as having no daily cap at
 * all, with nothing in the UI to tell you. A DATE disarms itself: once the clock
 * passes midnight UTC, a forgotten value is just an inert string.
 *
 * The quota_reset table then makes it idempotent WITHIN the day, so three
 * restarts on reset day still perform exactly one reset.
 *
 * Deliberately NOT wired to `DELETE FROM logs` or anything else. It resets
 * counters. A switch that quietly does more than its name says is how an operator
 * destroys data they meant to keep.
 */
function applyQuotaReset(database: DatabaseSync): void {
  const requested = process.env.QUOTA_RESET_DATE?.trim()
  if (!requested) return

  const today = new Date().toISOString().slice(0, 10)
  if (requested !== today) {
    // Stale or future value — inert, but say so. A silent no-op here looks
    // identical to a reset that worked, and the operator is waiting to hear.
    console.log(
      `[quota] QUOTA_RESET_DATE=${requested} is not today (${today}) — no reset. ` +
      `Set it to today's UTC date to reset the counters.`,
    )
    return
  }

  const already = database
    .prepare('SELECT date FROM quota_reset WHERE date = ?')
    .get(today) as unknown as { date: string } | undefined
  if (already) {
    console.log(`[quota] reset for ${today} already applied — skipping (idempotent across restarts).`)
    return
  }

  const before = database
    .prepare('SELECT count FROM daily_quota WHERE date = ?')
    .get(today) as unknown as { count: number } | undefined

  database.exec('BEGIN')
  try {
    database.prepare('DELETE FROM daily_quota WHERE date = ?').run(today)
    database.prepare('DELETE FROM daily_quota_device WHERE date = ?').run(today)
    database.prepare('INSERT INTO quota_reset (date, applied_at) VALUES (?, ?)').run(today, Date.now())
    database.exec('COMMIT')
  } catch (err) {
    database.exec('ROLLBACK')
    console.error('[quota] reset FAILED — counters unchanged:', err)
    return
  }

  // Loud on purpose. This hands free capacity back to the world; it should never
  // be something you discover later in a bill.
  console.log(
    `[quota] RESET APPLIED for ${today} — global counter was ${before?.count ?? 0}, now 0; ` +
    `all per-device counters cleared. Remove QUOTA_RESET_DATE when you're done ` +
    `(it self-disarms at midnight UTC regardless).`,
  )
}

export default db
